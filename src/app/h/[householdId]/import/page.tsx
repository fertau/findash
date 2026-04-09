'use client';

import { useState, useCallback } from 'react';
import {
  Upload, FileText, CheckCircle, AlertTriangle, XCircle,
  Loader2, Search, ChevronDown, ChevronRight, Building2, CreditCard, Landmark, FileSpreadsheet,
} from 'lucide-react';
import { AVAILABLE_PARSERS } from '@/config/banks';
import { cn } from '@/lib/cn';
import { useParams } from 'next/navigation';

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
}

interface ImportResult {
  importBatchId: string;
  status: string;
  transactionsImported: number;
  duplicatesSkipped: number;
  errors: string[];
}

const CONFIDENCE_CONFIG = {
  high: { label: 'Alta', color: 'text-accent-positive', bg: 'bg-accent-positive/10', border: 'border-accent-positive/20' },
  medium: { label: 'Media', color: 'text-accent-warning', bg: 'bg-accent-warning/10', border: 'border-accent-warning/20' },
  low: { label: 'Baja', color: 'text-accent-negative', bg: 'bg-accent-negative/10', border: 'border-accent-negative/20' },
};

const FORMAT_LABELS: Record<string, string> = {
  pdf: 'PDF',
  csv: 'CSV',
  xls: 'Excel (XLS)',
  xlsx: 'Excel (XLSX)',
  tsv: 'TSV',
  unknown: 'Desconocido',
};

function InstitutionIcon({ institution }: { institution: string | null }) {
  if (!institution) return <FileSpreadsheet className="w-8 h-8 text-text-muted" />;
  return <Building2 className="w-8 h-8 text-accent-info" />;
}

function DocumentTypeIcon({ type }: { type: string | null }) {
  if (!type) return <FileText className="w-5 h-5 text-text-muted" />;
  if (/tarjeta|card|visa|amex|mastercard/i.test(type)) return <CreditCard className="w-5 h-5 text-accent-info" />;
  if (/cuenta|bank|extracto/i.test(type)) return <Landmark className="w-5 h-5 text-accent-info" />;
  return <FileText className="w-5 h-5 text-accent-info" />;
}

export default function ImportPage() {
  const params = useParams();
  const householdId = params.householdId as string;

  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedParserKey, setSelectedParserKey] = useState<string>('');
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('');
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);

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

      // Pre-select the detected values
      setSelectedParserKey(data.parserKey || '');
      setSelectedInstitution(data.institution || '');
      setSelectedDocType(data.documentType || '');

      // If it's a known source with high confidence, could auto-import
      // but we always ask for confirmation per user's request
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
    if (!file || !selectedParserKey) return;
    setStep('importing');
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sourceId', selectedParserKey);
      formData.append('memberId', 'self');
      formData.append('institution', selectedInstitution);
      formData.append('documentType', selectedDocType);

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
    setSelectedParserKey('');
    setSelectedInstitution('');
    setSelectedDocType('');
    setShowAlternatives(false);
    setResult(null);
    setError('');
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
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-10 h-10 text-text-muted" />
            <p className="text-sm text-text-secondary">Arrastrá un archivo o hacé click para seleccionar</p>
            <p className="text-xs text-text-muted">PDF, CSV, XLS, XLSX — el sistema detecta automáticamente la institución</p>
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
      {step === 'confirm' && detection && (
        <div className="space-y-4">
          {/* File info bar */}
          <div className="flex items-center gap-3 px-4 py-3 bg-bg-surface rounded-lg border border-border">
            <FileText className="w-5 h-5 text-text-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary font-medium truncate">{file?.name}</p>
              <p className="text-xs text-text-muted">
                {FORMAT_LABELS[detection.fileFormat] || detection.fileFormat}
                {file && ` · ${(file.size / 1024).toFixed(0)} KB`}
              </p>
            </div>
            <button onClick={reset} className="text-xs text-accent-info hover:underline flex-shrink-0">
              Cambiar
            </button>
          </div>

          {/* Detection result card */}
          <div className={cn(
            'rounded-lg border p-5',
            detection.isKnownSource
              ? 'bg-accent-positive/5 border-accent-positive/20'
              : CONFIDENCE_CONFIG[detection.confidence].bg + ' ' + CONFIDENCE_CONFIG[detection.confidence].border
          )}>
            {detection.isKnownSource && (
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-accent-positive" />
                <span className="text-xs font-medium text-accent-positive">Fuente reconocida</span>
              </div>
            )}

            <div className="flex items-start gap-4">
              <InstitutionIcon institution={detection.institution} />
              <div className="flex-1">
                {detection.institution ? (
                  <>
                    <p className="text-lg font-semibold text-text-primary">{detection.institution}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <DocumentTypeIcon type={detection.documentType} />
                      <span className="text-sm text-text-secondary">{detection.documentType || 'Documento'}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-text-primary">Institución no detectada</p>
                    <p className="text-sm text-text-muted mt-1">Seleccioná el formato correcto abajo</p>
                  </>
                )}
                {!detection.isKnownSource && detection.institution && (
                  <div className="mt-2">
                    <span className={cn('text-xs font-medium', CONFIDENCE_CONFIG[detection.confidence].color)}>
                      Confianza: {CONFIDENCE_CONFIG[detection.confidence].label}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Parser selection */}
            <div className="mt-4 pt-4 border-t border-border/50">
              <label className="block text-xs font-medium text-text-secondary uppercase mb-2">
                Formato de parseo
              </label>
              <select
                value={selectedParserKey}
                onChange={(e) => {
                  setSelectedParserKey(e.target.value);
                  // Update institution/doctype from parser metadata
                  const parser = AVAILABLE_PARSERS.find((p) => p.key === e.target.value);
                  if (parser) {
                    // Try to extract institution from label
                    const match = parser.label.match(/formato\s+(\w+)/i);
                    if (match) setSelectedInstitution(match[1]);
                  }
                }}
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-info"
              >
                <option value="">Seleccioná el formato</option>

                {/* Show detected/matched first */}
                {detection.parserKey && (
                  <option value={detection.parserKey}>
                    {AVAILABLE_PARSERS.find((p) => p.key === detection.parserKey)?.label || detection.parserKey}
                    {' '}(detectado)
                  </option>
                )}

                {/* Previously used sources from this household */}
                {detection.householdSources && detection.householdSources.length > 0 && (
                  <optgroup label="Fuentes anteriores">
                    {detection.householdSources
                      .filter((s) => s.parserKey !== detection.parserKey)
                      .map((s) => (
                        <option key={`hs-${s.id}`} value={s.parserKey}>
                          {s.label}
                        </option>
                      ))}
                  </optgroup>
                )}

                {/* All available parsers */}
                <optgroup label="Todos los formatos">
                  {AVAILABLE_PARSERS
                    .filter((p) => p.key !== detection.parserKey)
                    .map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Show other candidates if confidence is not high */}
            {detection.candidates.length > 1 && !detection.isKnownSource && (
              <div className="mt-3">
                <button
                  onClick={() => setShowAlternatives(!showAlternatives)}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary"
                >
                  {showAlternatives ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {detection.candidates.length - 1} alternativa{detection.candidates.length > 2 ? 's' : ''} detectada{detection.candidates.length > 2 ? 's' : ''}
                </button>
                {showAlternatives && (
                  <div className="mt-2 space-y-1">
                    {detection.candidates
                      .filter((c) => c.parserKey !== selectedParserKey)
                      .map((c) => (
                        <button
                          key={c.parserKey}
                          onClick={() => setSelectedParserKey(c.parserKey)}
                          className="w-full text-left px-3 py-2 text-xs bg-bg-primary/50 rounded border border-border/50 hover:border-accent-info/30 transition-colors"
                        >
                          <span className="text-text-primary">{c.label}</span>
                          {c.description && <span className="text-text-muted ml-2">{c.description}</span>}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Import button */}
          <button
            onClick={handleImport}
            disabled={!selectedParserKey}
            className="w-full px-4 py-2.5 bg-accent-info hover:bg-accent-info/90 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {detection.isKnownSource ? 'Importar' : 'Confirmar e importar'}
          </button>
        </div>
      )}

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

            {detection?.institution && (
              <p className="text-sm text-text-muted mb-4">
                {detection.institution} — {detection.documentType || 'Documento'}
                {!detection.isKnownSource && (
                  <span className="ml-2 text-accent-info">(guardado como fuente)</span>
                )}
              </p>
            )}

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
