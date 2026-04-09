'use client';

import { useState, useCallback } from 'react';
import {
  Upload, FileText, CheckCircle, XCircle,
  Loader2, Search, Building2, CreditCard, Landmark, FileSpreadsheet, Pencil, Wrench,
} from 'lucide-react';
import { AVAILABLE_PARSERS } from '@/config/banks';
import { cn } from '@/lib/cn';
import { useParams, useRouter } from 'next/navigation';

type Step = 'upload' | 'detecting' | 'confirm' | 'importing' | 'success' | 'error';

interface DetectionResult {
  fileFormat: string;
  parserKey: string | null;
  institution: string | null;
  documentType: string | null;
  confidence: 'high' | 'medium' | 'low';
  candidates: Array<{ parserKey: string; label: string; description: string; score: number }>;
  fingerprintHash: string;
  isKnownSource: boolean;
  matchedSourceId?: string;
  matchedSourceLabel?: string;
  householdSources?: Array<{ id: string; label: string; parserKey: string; institution: string; documentType: string }>;
  extractedText?: string;
}

interface ImportResult {
  importBatchId: string;
  status: string;
  transactionsImported: number;
  duplicatesSkipped: number;
  errors: string[];
}

const FORMAT_ICONS: Record<string, string> = {
  pdf: 'PDF',
  csv: 'CSV',
  xls: 'XLS',
  xlsx: 'XLSX',
  tsv: 'TSV',
};

/** Human-readable summary of what the system detected */
function detectionSummary(d: DetectionResult): { title: string; subtitle: string } {
  if (d.isKnownSource && d.matchedSourceLabel) {
    return { title: d.matchedSourceLabel, subtitle: 'Fuente reconocida de importaciones anteriores' };
  }
  if (d.institution && d.documentType) {
    return { title: `${d.institution} — ${d.documentType}`, subtitle: `Detectado del contenido del archivo (${FORMAT_ICONS[d.fileFormat] || d.fileFormat})` };
  }
  if (d.institution) {
    return { title: d.institution, subtitle: `Institución detectada (${FORMAT_ICONS[d.fileFormat] || d.fileFormat})` };
  }
  // No institution detected — describe by format
  const fmt = FORMAT_ICONS[d.fileFormat] || d.fileFormat;
  return { title: `Archivo ${fmt}`, subtitle: 'Se importará con detección automática de columnas' };
}

/** Pick the right icon for the detection result */
function DetectionIcon({ detection }: { detection: DetectionResult }) {
  if (detection.institution) {
    return <Building2 className="w-9 h-9 text-accent-info" />;
  }
  if (detection.documentType && /tarjeta|card|visa/i.test(detection.documentType)) {
    return <CreditCard className="w-9 h-9 text-accent-info" />;
  }
  if (detection.documentType && /cuenta|bank/i.test(detection.documentType)) {
    return <Landmark className="w-9 h-9 text-accent-info" />;
  }
  return <FileSpreadsheet className="w-9 h-9 text-text-muted" />;
}

/**
 * Given a detection result, resolve the parser key automatically.
 * CSV/TSV → generic_csv, XLS/XLSX → generic_xlsx, PDF + institution → bank parser.
 */
function autoResolveParser(d: DetectionResult): string {
  // If the detector already matched a specific parser, use it
  if (d.parserKey) return d.parserKey;

  // Fallback by file format
  if (d.fileFormat === 'csv' || d.fileFormat === 'tsv') return 'generic_csv';
  if (d.fileFormat === 'xls' || d.fileFormat === 'xlsx') return 'generic_xlsx';

  return 'generic_csv'; // last resort
}

export default function ImportPage() {
  const params = useParams();
  const router = useRouter();
  const householdId = params.householdId as string;

  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [parserOverride, setParserOverride] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const effectiveParser = detection
    ? (parserOverride || autoResolveParser(detection))
    : '';

  const detectFile = useCallback(async (fileToDetect: File) => {
    setStep('detecting');
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', fileToDetect);

      const res = await fetch(`/api/households/${householdId}/import/detect`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Detection failed');
      }

      const data: DetectionResult = await res.json();
      setDetection(data);
      setParserOverride(null);
      setIsEditing(false);
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar el archivo');
      setStep('error');
    }
  }, [householdId]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      detectFile(droppedFile);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      detectFile(selected);
    }
  }

  async function handleImport() {
    if (!file || !effectiveParser) return;
    setStep('importing');
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sourceId', effectiveParser);
      if (detection?.institution) formData.append('institution', detection.institution);
      if (detection?.documentType) formData.append('documentType', detection.documentType);

      const res = await fetch(`/api/households/${householdId}/import`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar');
      setStep('error');
    }
  }

  function reset() {
    setFile(null);
    setStep('upload');
    setDetection(null);
    setParserOverride(null);
    setIsEditing(false);
    setResult(null);
    setError('');
  }

  function goToTemplateBuilder() {
    // Store PDF text in sessionStorage so the template builder can use it
    if (detection?.extractedText) {
      sessionStorage.setItem('templateBuilderText', detection.extractedText);
    }
    if (detection?.institution) {
      sessionStorage.setItem('templateBuilderInstitution', detection.institution);
    }
    if (file?.name) {
      sessionStorage.setItem('templateBuilderFileName', file.name);
    }
    router.push(`/h/${householdId}/settings?tab=parsers&new=1`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">Importar resumen</h1>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer',
            dragActive ? 'border-accent-info bg-accent-info/5' : 'border-border hover:border-text-muted'
          )}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            className="hidden"
            accept=".pdf,.csv,.xls,.xlsx,.tsv"
            onChange={handleFileSelect}
          />
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-10 h-10 text-text-muted" />
            <p className="text-sm text-text-secondary">Arrastrá un archivo o hacé click para seleccionar</p>
            <p className="text-xs text-text-muted">PDF, CSV, XLS, XLSX</p>
          </div>
        </div>
      )}

      {/* Step 2: Detecting */}
      {step === 'detecting' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Search className="w-10 h-10 text-accent-info animate-pulse" />
          <p className="text-sm text-text-secondary">Analizando archivo...</p>
          <p className="text-xs text-text-muted">{file?.name}</p>
        </div>
      )}

      {/* Step 3: Confirm detection */}
      {step === 'confirm' && detection && (() => {
        const summary = detectionSummary(detection);
        return (
          <div className="space-y-4">
            {/* Detection card */}
            <div className="rounded-lg border border-border bg-bg-surface p-5">
              <div className="flex items-start gap-4">
                <DetectionIcon detection={detection} />
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-text-primary">{summary.title}</p>
                  <p className="text-sm text-text-muted mt-0.5">{summary.subtitle}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-text-muted">
                      {file?.name} · {file && `${(file.size / 1024).toFixed(0)} KB`}
                    </span>
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="text-xs text-accent-info hover:underline flex-shrink-0 mt-1"
                >
                  Cambiar archivo
                </button>
              </div>

              {/* Correction toggle — collapsed by default */}
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 mt-4 text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Corregir detección
                </button>
              )}

              {isEditing && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <label className="block text-xs font-medium text-text-muted mb-2">
                    Formato de parseo
                  </label>
                  <select
                    value={parserOverride || autoResolveParser(detection)}
                    onChange={(e) => setParserOverride(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-info"
                  >
                    {/* Previously used household sources */}
                    {detection.householdSources && detection.householdSources.length > 0 && (
                      <optgroup label="Fuentes anteriores">
                        {detection.householdSources.map((s) => (
                          <option key={`hs-${s.id}`} value={s.parserKey}>
                            {s.label}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {/* All available parsers */}
                    {AVAILABLE_PARSERS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setParserOverride(null); setIsEditing(false); }}
                    className="mt-2 text-xs text-text-muted hover:text-text-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* Import button */}
            <button
              onClick={handleImport}
              className="w-full px-4 py-3 bg-accent-info hover:bg-accent-info/90 text-white rounded-md text-sm font-medium transition-colors"
            >
              Importar
            </button>
          </div>
        );
      })()}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="w-10 h-10 text-accent-info animate-spin" />
          <p className="text-sm text-text-secondary">Procesando archivo...</p>
        </div>
      )}

      {/* Step 5: Success */}
      {step === 'success' && result && (
        <div className="space-y-4">
          <div className="bg-bg-surface rounded-lg border border-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-6 h-6 text-accent-positive" />
              <h2 className="text-lg font-semibold text-text-primary">Importación exitosa</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-text-muted">Transacciones importadas</p>
                <p className="text-xl font-bold text-text-primary tabular-nums">{result.transactionsImported}</p>
              </div>
              <div>
                <p className="text-text-muted">Duplicados omitidos</p>
                <p className="text-xl font-bold text-text-secondary tabular-nums">{result.duplicatesSkipped}</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4 p-3 bg-accent-warning/10 border border-accent-warning/20 rounded-md">
                <p className="text-xs font-medium text-accent-warning mb-1">{result.errors.length} advertencias</p>
                {result.errors.slice(0, 5).map((err, i) => (
                  <p key={i} className="text-xs text-text-muted">{err}</p>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={reset}
            className="w-full px-4 py-2.5 bg-bg-surface hover:bg-bg-surface-hover border border-border text-text-primary rounded-md text-sm font-medium transition-colors"
          >
            Importar otro archivo
          </button>
        </div>
      )}

      {/* Step 6: Error */}
      {step === 'error' && (
        <div className="space-y-4">
          <div className="bg-bg-surface rounded-lg border border-accent-negative/20 p-6">
            <div className="flex items-center gap-3 mb-2">
              <XCircle className="w-6 h-6 text-accent-negative" />
              <h2 className="text-lg font-semibold text-text-primary">Error</h2>
            </div>
            <p className="text-sm text-text-secondary">{error}</p>
          </div>

          {/* Offer template creation when parsing/detection failed on a PDF */}
          {detection?.extractedText && (
            <button
              onClick={goToTemplateBuilder}
              className="w-full px-4 py-3 bg-bg-surface hover:bg-bg-surface-hover border border-border text-text-primary rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Wrench className="w-4 h-4 text-accent-info" />
              Crear template de parseo para este formato
            </button>
          )}

          <button
            onClick={reset}
            className="w-full px-4 py-2.5 bg-accent-info hover:bg-accent-info/90 text-white rounded-md text-sm font-medium transition-colors"
          >
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
