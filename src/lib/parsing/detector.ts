import { createHash } from 'crypto';
import { AVAILABLE_PARSERS } from '@/config/banks';

export type FileFormat = 'pdf' | 'csv' | 'xls' | 'xlsx' | 'tsv' | 'unknown';

export interface DetectionResult {
  fileFormat: FileFormat;
  /** Best-guess parser key from AVAILABLE_PARSERS */
  parserKey: string | null;
  /** Human-readable institution name */
  institution: string | null;
  /** Human-readable document type (e.g. "Tarjeta de crédito", "Cuenta bancaria") */
  documentType: string | null;
  /** How confident we are: high = strong match, medium = partial signals, low = guessing from format */
  confidence: 'high' | 'medium' | 'low';
  /** All candidate parsers sorted by likelihood */
  candidates: DetectionCandidate[];
  /** Fingerprint hash for matching future imports from the same source */
  fingerprintHash: string;
  /** If matched against a previously saved household import source */
  matchedSourceId?: string;
  matchedSourceLabel?: string;
}

export interface DetectionCandidate {
  parserKey: string;
  label: string;
  description: string;
  score: number;
}

/**
 * Known institution fingerprints.
 * Each entry defines text patterns to search for in the raw file content.
 * Patterns are checked against the first ~8KB of the file (covers headers/metadata).
 */
interface InstitutionFingerprint {
  institution: string;
  /** Patterns that strongly identify this institution */
  patterns: RegExp[];
  /** Sub-patterns to distinguish document type within the institution */
  subTypes: Array<{
    parserKey: string;
    documentType: string;
    patterns: RegExp[];
  }>;
}

const FINGERPRINTS: InstitutionFingerprint[] = [
  {
    institution: 'Galicia',
    patterns: [
      /BANCO\s*(DE\s*)?GALICIA/i,
      /GALICIA.*BUENOS\s*AIRES/i,
      /EMINENT.*GALICIA/i,
      /galicia\.com/i,
    ],
    subTypes: [
      {
        parserKey: 'galicia_card',
        documentType: 'Tarjeta de crédito',
        patterns: [/TARJETA.*CR[EÉ]DITO/i, /RESUMEN.*TARJETA/i, /VISA|MASTERCARD|AMERICAN/i, /VENCIMIENTO.*PAGO/i, /PAGO\s*M[IÍ]NIMO/i],
      },
      {
        parserKey: 'galicia_bank',
        documentType: 'Cuenta bancaria',
        patterns: [/EXTRACTO|CUENTA\s*(CORRIENTE|AHORRO)/i, /MOVIMIENTOS.*CUENTA/i, /SALDO\s*(ANTERIOR|INICIAL)/i],
      },
    ],
  },
  {
    institution: 'Santander',
    patterns: [
      /BANCO\s*SANTANDER/i,
      /SANTANDER\s*R[IÍ]O/i,
      /santander\.com/i,
      /SANTANDER.*ARGENTINA/i,
    ],
    subTypes: [
      {
        parserKey: 'santander_card',
        documentType: 'Tarjeta de crédito',
        patterns: [/TARJETA.*CR[EÉ]DITO/i, /RESUMEN.*VISA/i, /RESUMEN.*AMEX/i, /AMERICAN\s*EXPRESS/i, /PAGO\s*M[IÍ]NIMO/i],
      },
      {
        parserKey: 'santander_bank',
        documentType: 'Cuenta bancaria',
        patterns: [/EXTRACTO|CUENTA\s*(CORRIENTE|AHORRO)/i, /MOVIMIENTOS/i, /SALDO/i],
      },
    ],
  },
  {
    institution: 'Itaú',
    patterns: [
      /BANCO\s*ITA[UÚ]/i,
      /ITA[UÚ].*ARGENTINA/i,
      /ITA[UÚ].*URUGUAY/i,
      /itau\.com/i,
    ],
    subTypes: [
      {
        parserKey: 'itau_visa',
        documentType: 'Tarjeta Visa',
        patterns: [/VISA/i, /TARJETA.*CR[EÉ]DITO/i, /RESUMEN/i, /PESOS\s*URUGUAYOS|D[OÓ]LARES/i],
      },
      {
        parserKey: 'itau_bank',
        documentType: 'Cuenta bancaria',
        patterns: [/EXTRACTO|MOVIMIENTOS|CUENTA/i, /SALDO/i],
      },
    ],
  },
];

/**
 * Compute a fingerprint hash from institutional signals in the file.
 * This identifies the "type" of file (e.g. "Galicia card PDF") regardless of
 * specific dates/amounts. Used to auto-match future imports.
 */
function computeFingerprintHash(text: string, format: FileFormat): string {
  // Extract institutional markers (bank names, document type keywords)
  const markers: string[] = [format];

  for (const fp of FINGERPRINTS) {
    for (const pattern of fp.patterns) {
      if (pattern.test(text)) {
        markers.push(fp.institution);
        break;
      }
    }
    for (const sub of fp.subTypes) {
      for (const pattern of sub.patterns) {
        if (pattern.test(text)) {
          markers.push(sub.parserKey);
          break;
        }
      }
    }
  }

  return createHash('sha256').update(markers.sort().join('|')).digest('hex').slice(0, 16);
}

/**
 * Detect file format from extension and MIME type.
 */
export function detectFileFormat(fileName: string, mimeType?: string): FileFormat {
  const ext = fileName.split('.').pop()?.toLowerCase();

  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'csv' || mimeType === 'text/csv') return 'csv';
  if (ext === 'tsv' || mimeType === 'text/tab-separated-values') return 'tsv';
  if (ext === 'xlsx' || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (ext === 'xls' || mimeType === 'application/vnd.ms-excel') return 'xls';

  return 'unknown';
}

/**
 * Extract readable text from a file buffer for fingerprinting.
 * For PDFs, scans raw bytes for readable ASCII/Latin strings.
 * For text files (CSV/TSV), reads directly.
 * For XLS/XLSX, extracts what we can from raw bytes.
 */
function extractTextForFingerprinting(buffer: Buffer, format: FileFormat): string {
  if (format === 'csv' || format === 'tsv') {
    // Text files: read directly, first 8KB
    return buffer.subarray(0, 8192).toString('utf-8');
  }

  if (format === 'pdf') {
    // PDF: scan raw bytes for readable text sequences.
    // Most PDFs have institution names in cleartext (metadata, headers, stream content).
    // We extract ASCII+Latin1 text runs of 3+ characters.
    const text: string[] = [];
    const raw = buffer.subarray(0, Math.min(buffer.length, 65536)); // First 64KB
    let current = '';

    for (let i = 0; i < raw.length; i++) {
      const byte = raw[i];
      // Printable ASCII + common Latin1 accented chars
      if ((byte >= 32 && byte <= 126) || (byte >= 160 && byte <= 255)) {
        current += String.fromCharCode(byte);
      } else {
        if (current.length >= 3) {
          text.push(current);
        }
        current = '';
      }
    }
    if (current.length >= 3) text.push(current);

    return text.join(' ');
  }

  if (format === 'xls' || format === 'xlsx') {
    // Binary formats: extract readable strings from raw bytes
    const text: string[] = [];
    const raw = buffer.subarray(0, Math.min(buffer.length, 32768));
    let current = '';

    for (let i = 0; i < raw.length; i++) {
      const byte = raw[i];
      if ((byte >= 32 && byte <= 126) || (byte >= 160 && byte <= 255)) {
        current += String.fromCharCode(byte);
      } else {
        if (current.length >= 3) text.push(current);
        current = '';
      }
    }
    if (current.length >= 3) text.push(current);

    return text.join(' ');
  }

  return '';
}

/**
 * Score a list of patterns against text content.
 * Returns the number of distinct patterns that matched.
 */
function scorePatterns(text: string, patterns: RegExp[]): number {
  return patterns.filter((p) => p.test(text)).length;
}

/**
 * Detect the institution and document type from a file.
 *
 * Returns a DetectionResult with the best guess and all candidates.
 * The caller should present this to the user for confirmation.
 */
export function detectSource(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): DetectionResult {
  const fileFormat = detectFileFormat(fileName, mimeType);
  const text = extractTextForFingerprinting(buffer, fileFormat);
  const candidates: DetectionCandidate[] = [];

  // Score each institution + subtype combination
  for (const fp of FINGERPRINTS) {
    const institutionScore = scorePatterns(text, fp.patterns);
    if (institutionScore === 0) continue;

    for (const sub of fp.subTypes) {
      const subScore = scorePatterns(text, sub.patterns);
      const totalScore = institutionScore + subScore;

      const parser = AVAILABLE_PARSERS.find((p) => p.key === sub.parserKey);
      candidates.push({
        parserKey: sub.parserKey,
        label: parser?.label || `${fp.institution} - ${sub.documentType}`,
        description: parser?.description || '',
        score: totalScore,
      });
    }
  }

  // Add generic parsers based on file format
  if (fileFormat === 'csv' || fileFormat === 'tsv') {
    candidates.push({
      parserKey: 'generic_csv',
      label: 'CSV genérico',
      description: 'Archivo CSV con columnas configurables',
      score: candidates.length === 0 ? 1 : 0, // Only score if no bank detected
    });
  } else if (fileFormat === 'xls' || fileFormat === 'xlsx') {
    candidates.push({
      parserKey: 'generic_xlsx',
      label: 'Excel genérico',
      description: 'Archivo XLS/XLSX con columnas configurables',
      score: candidates.length === 0 ? 1 : 0,
    });
    // Itaú bank uses XLS, bump it if format matches
    const itauBank = candidates.find((c) => c.parserKey === 'itau_bank');
    if (itauBank) itauBank.score += 1;
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Compute fingerprint hash from matched institution patterns
  // Used to auto-match future imports from the same source
  const fingerprintHash = computeFingerprintHash(text, fileFormat);

  // Determine best match
  const best = candidates[0];

  if (!best || best.score === 0) {
    // No institution detected, suggest generic parser
    const genericKey = fileFormat === 'csv' || fileFormat === 'tsv'
      ? 'generic_csv'
      : fileFormat === 'xls' || fileFormat === 'xlsx'
        ? 'generic_xlsx'
        : null;

    return {
      fileFormat,
      parserKey: genericKey,
      institution: null,
      documentType: null,
      confidence: 'low',
      candidates,
      fingerprintHash,
    };
  }

  // Find institution name and document type from fingerprints
  let institution: string | null = null;
  let documentType: string | null = null;

  for (const fp of FINGERPRINTS) {
    for (const sub of fp.subTypes) {
      if (sub.parserKey === best.parserKey) {
        institution = fp.institution;
        documentType = sub.documentType;
        break;
      }
    }
    if (institution) break;
  }

  // Confidence based on score
  const confidence: 'high' | 'medium' | 'low' =
    best.score >= 3 ? 'high' : best.score >= 2 ? 'medium' : 'low';

  return {
    fileFormat,
    parserKey: best.parserKey,
    institution,
    documentType,
    confidence,
    candidates,
    fingerprintHash,
  };
}
