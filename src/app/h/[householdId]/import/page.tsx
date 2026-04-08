'use client';

import { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Loader2, Settings } from 'lucide-react';
import { DEFAULT_SOURCES, AVAILABLE_PARSERS } from '@/config/banks';
import type { BankSource } from '@/config/banks';
import { cn } from '@/lib/cn';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type ImportStatus = 'idle' | 'uploading' | 'success' | 'error';

interface ImportResult {
  importBatchId: string;
  status: string;
  transactionsImported: number;
  duplicatesSkipped: number;
  errors: string[];
}

const TRUST_LABELS: Record<string, { label: string; color: string }> = {
  exact: { label: 'Alta', color: 'text-accent-positive' },
  contains: { label: 'Alta', color: 'text-accent-positive' },
  regex: { label: 'Media', color: 'text-accent-warning' },
  keyword: { label: 'Baja', color: 'text-accent-warning' },
  uncategorized: { label: 'Sin categoría', color: 'text-accent-negative' },
  manual: { label: 'Manual', color: 'text-accent-info' },
};

export default function ImportPage() {
  const params = useParams();
  const householdId = params.householdId as string;
  const [file, setFile] = useState<File | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [householdSources, setHouseholdSources] = useState<BankSource[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  // Load household-configured sources
  useState(() => {
    fetch(`/api/households/${householdId}/cards`)
      .then((res) => res.ok ? res.json() : { cards: [] })
      .then((data) => {
        // Convert card mappings to source options if they reference parsers
        setHouseholdSources(data.cards || []);
        setSourcesLoaded(true);
      })
      .catch(() => setSourcesLoaded(true));
  });

  // Combine: household-configured sources + default generic sources
  const availableSources = [...householdSources, ...DEFAULT_SOURCES];

  async function handleUpload() {
    if (!file || !sourceId) return;
    setStatus('uploading');
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sourceId', sourceId);
      formData.append('memberId', 'self'); // Will be resolved server-side

      const res = await fetch(`/api/households/${householdId}/import`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar');
      setStatus('error');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }

  function reset() {
    setFile(null);
    setSourceId('');
    setStatus('idle');
    setResult(null);
    setError('');
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">Importar resumen</h1>

      {status === 'idle' && (
        <>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer',
              dragActive ? 'border-accent-info bg-accent-info/5' : 'border-border hover:border-text-muted',
              file ? 'border-accent-positive bg-accent-positive/5' : ''
            )}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              className="hidden"
              accept=".pdf,.csv,.xls,.xlsx,.tsv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="w-10 h-10 text-accent-positive" />
                <p className="text-sm text-text-primary font-medium">{file.name}</p>
                <p className="text-xs text-text-muted">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-10 h-10 text-text-muted" />
                <p className="text-sm text-text-secondary">Arrastrá un archivo o hacé click para seleccionar</p>
                <p className="text-xs text-text-muted">PDF, CSV, XLS, XLSX</p>
              </div>
            )}
          </div>

          {/* Source selector */}
          <div>
            <label className="block text-xs font-medium text-text-secondary uppercase mb-1">
              Origen
            </label>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-info"
            >
              <option value="">Seleccioná el formato del archivo</option>
              <option value="auto">Detectar automáticamente</option>
              {availableSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.bank} — {s.product}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1">
              ¿Necesitás más opciones?{' '}
              <Link href={`/h/${householdId}/settings`} className="text-accent-info hover:underline">
                Configurá tus fuentes
              </Link>
            </p>
          </div>

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={!file || !sourceId}
            className="w-full px-4 py-2.5 bg-accent-info hover:bg-accent-info/90 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Importar
          </button>
        </>
      )}

      {status === 'uploading' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="w-10 h-10 text-accent-info animate-spin" />
          <p className="text-sm text-text-secondary">Procesando archivo...</p>
        </div>
      )}

      {status === 'success' && result && (
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

      {status === 'error' && (
        <div className="space-y-4">
          <div className="bg-bg-surface rounded-lg border border-accent-negative/20 p-6">
            <div className="flex items-center gap-3 mb-2">
              <XCircle className="w-6 h-6 text-accent-negative" />
              <h2 className="text-lg font-semibold text-text-primary">Error al importar</h2>
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
