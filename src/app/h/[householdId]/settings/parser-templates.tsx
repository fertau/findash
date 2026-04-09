'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Save, TestTube, ChevronDown, ChevronUp,
  FileText, CheckCircle, XCircle, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DateFormatKey, Currency } from '@/lib/db/types';

interface ParserTemplateData {
  id?: string;
  label: string;
  institution: string;
  documentType: string;
  fingerprints: string[];
  sectionStart?: string;
  sectionEnd?: string;
  dateFormat: DateFormatKey;
  skipPatterns: string[];
  pageHeaderPattern?: string;
  hasTrailingMinus: boolean;
  hasBalanceColumn: boolean;
  defaultCurrency: Currency;
  dualCurrency?: {
    secondaryCurrency: Currency;
    mode: 'column' | 'section';
    sectionPatterns?: { pattern: string; currency: Currency }[];
  };
  negateAmounts: boolean;
  continuationMinIndent?: number;
  descriptionCleanup?: string[];
}

interface TestResult {
  transactions: Array<{ date: string; description: string; amount: number; currency: string }>;
  totalTransactions: number;
  lineCount: number;
  sectionFound: boolean;
}

const DATE_FORMATS: { value: DateFormatKey; label: string; example: string }[] = [
  { value: 'DD/MM/YY', label: 'DD/MM/AA', example: '25/01/26' },
  { value: 'DD-MM-YY', label: 'DD-MM-AA', example: '25-01-26' },
  { value: 'DD-Mmm-YY', label: 'DD-Mmm-AA', example: '25-Ene-26' },
  { value: 'YY-Month-DD', label: 'AA Mes DD', example: '26 Enero 25' },
  { value: 'DD MM YY', label: 'DD MM AA (espacios)', example: '25 01 26' },
];

const CURRENCIES: Currency[] = ['ARS', 'USD', 'UYU'];

const emptyTemplate = (): ParserTemplateData => ({
  label: '',
  institution: '',
  documentType: '',
  fingerprints: [''],
  dateFormat: 'DD/MM/YY',
  skipPatterns: [''],
  hasTrailingMinus: false,
  hasBalanceColumn: false,
  defaultCurrency: 'ARS',
  negateAmounts: false,
});

export default function ParserTemplatesTab({ householdId, autoNew = false }: { householdId: string; autoNew?: boolean }) {
  const [templates, setTemplates] = useState<(ParserTemplateData & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ParserTemplateData | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/households/${householdId}/parser-templates`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Auto-open new template builder when coming from import page
  useEffect(() => {
    if (!autoNew || loading) return;

    const prefillText = sessionStorage.getItem('templateBuilderText') || '';
    const prefillInstitution = sessionStorage.getItem('templateBuilderInstitution') || '';
    const prefillFileName = sessionStorage.getItem('templateBuilderFileName') || '';

    // Clean up
    sessionStorage.removeItem('templateBuilderText');
    sessionStorage.removeItem('templateBuilderInstitution');
    sessionStorage.removeItem('templateBuilderFileName');

    const template = emptyTemplate();
    if (prefillInstitution) {
      template.institution = prefillInstitution;
      template.label = `${prefillInstitution} – Documento`;
    }
    if (prefillInstitution) {
      template.fingerprints = [`/${prefillInstitution}/i`];
    }

    setEditing(template);
    setIsNew(true);
    setTestResult(null);

    if (prefillText) {
      setTestText(prefillText);
    }
  }, [autoNew, loading]);

  function startNew() {
    setEditing(emptyTemplate());
    setIsNew(true);
    setTestResult(null);
    setTestText('');
    setTestFile(null);
    setShowAdvanced(false);
    setError('');
  }

  function startEdit(t: ParserTemplateData & { id: string }) {
    setEditing({ ...t });
    setIsNew(false);
    setTestResult(null);
    setTestText('');
    setTestFile(null);
    setShowAdvanced(false);
    setError('');
  }

  function cancelEdit() {
    setEditing(null);
    setIsNew(false);
    setError('');
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setError('');

    try {
      // Clean empty strings from arrays
      const cleaned = {
        ...editing,
        fingerprints: editing.fingerprints.filter((f) => f.trim()),
        skipPatterns: editing.skipPatterns.filter((s) => s.trim()),
        descriptionCleanup: editing.descriptionCleanup?.filter((d) => d.trim()),
      };

      const url = isNew
        ? `/api/households/${householdId}/parser-templates`
        : `/api/households/${householdId}/parser-templates/${editing.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleaned),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.errors?.[0]?.message || data.error || 'Error al guardar');
      }

      await fetchTemplates();
      setEditing(null);
      setIsNew(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este template de parseo?')) return;
    await fetch(`/api/households/${householdId}/parser-templates/${id}`, { method: 'DELETE' });
    await fetchTemplates();
  }

  async function handleTestFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setTestFile(f);

    // Extract PDF text client-side isn't possible — we'll send it to the test endpoint
    // For now, read as text for CSV or send as file
    if (f.name.endsWith('.csv') || f.name.endsWith('.tsv')) {
      const text = await f.text();
      setTestText(text);
    } else {
      // For PDFs, we need to extract text server-side
      // Use the detect endpoint to get the text
      const formData = new FormData();
      formData.append('file', f);
      try {
        const res = await fetch(`/api/households/${householdId}/import/detect`, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.extractedText) {
            setTestText(data.extractedText);
          }
        }
      } catch {
        // If detect doesn't return text, we'll handle it server-side in the test
      }
    }
  }

  async function handleTest() {
    if (!editing || !testText) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`/api/households/${householdId}/parser-templates/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: {
            ...editing,
            fingerprints: editing.fingerprints.filter((f) => f.trim()),
            skipPatterns: editing.skipPatterns.filter((s) => s.trim()),
          },
          text: testText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.errors?.[0]?.message || 'Error al probar');
        return;
      }
      setTestResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al probar');
    } finally {
      setTesting(false);
    }
  }

  // List of string array field editor
  function StringArrayField({
    label, values, onChange, placeholder,
  }: {
    label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string;
  }) {
    return (
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">{label}</label>
        {values.map((v, idx) => (
          <div key={idx} className="flex gap-2 mb-1">
            <input
              type="text"
              value={v}
              onChange={(e) => {
                const next = [...values];
                next[idx] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
              className="flex-1 px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info"
            />
            <button
              onClick={() => onChange(values.filter((_, i) => i !== idx))}
              className="text-text-muted hover:text-accent-negative"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...values, ''])}
          className="text-xs text-accent-info hover:underline mt-1"
        >
          + Agregar
        </button>
      </div>
    );
  }

  // ─── Template Editor ─────────────────────────────────────────────────────────

  if (editing) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {isNew ? 'Nuevo template de parseo' : `Editar: ${editing.label}`}
          </h2>
          <button onClick={cancelEdit} className="text-xs text-text-muted hover:text-text-secondary">
            Cancelar
          </button>
        </div>

        {error && (
          <div className="p-3 bg-accent-negative/10 border border-accent-negative/20 rounded text-xs text-accent-negative">
            {error}
          </div>
        )}

        {/* Basic fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Nombre</label>
            <input
              type="text"
              value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              placeholder="HSBC – Cuenta Corriente"
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Institución</label>
            <input
              type="text"
              value={editing.institution}
              onChange={(e) => setEditing({ ...editing, institution: e.target.value })}
              placeholder="HSBC"
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Tipo de documento</label>
            <input
              type="text"
              value={editing.documentType}
              onChange={(e) => setEditing({ ...editing, documentType: e.target.value })}
              placeholder="Cuenta Corriente"
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Formato de fecha</label>
            <select
              value={editing.dateFormat}
              onChange={(e) => setEditing({ ...editing, dateFormat: e.target.value as DateFormatKey })}
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info"
            >
              {DATE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label} ({f.example})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Moneda principal</label>
            <select
              value={editing.defaultCurrency}
              onChange={(e) => setEditing({ ...editing, defaultCurrency: e.target.value as Currency })}
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Inicio de sección</label>
            <input
              type="text"
              value={editing.sectionStart || ''}
              onChange={(e) => setEditing({ ...editing, sectionStart: e.target.value || undefined })}
              placeholder="Movimientos o /regex/"
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info"
            />
          </div>
        </div>

        {/* Checkboxes */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={editing.negateAmounts}
              onChange={(e) => setEditing({ ...editing, negateAmounts: e.target.checked })}
              className="rounded border-border"
            />
            Tarjeta (negar montos)
          </label>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={editing.hasBalanceColumn}
              onChange={(e) => setEditing({ ...editing, hasBalanceColumn: e.target.checked })}
              className="rounded border-border"
            />
            Columna de saldo (ignorar último monto)
          </label>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={editing.hasTrailingMinus}
              onChange={(e) => setEditing({ ...editing, hasTrailingMinus: e.target.checked })}
              className="rounded border-border"
            />
            Signo menos al final = crédito
          </label>
        </div>

        {/* Fingerprints */}
        <StringArrayField
          label="Huellas de identificación (regex para auto-detección)"
          values={editing.fingerprints}
          onChange={(v) => setEditing({ ...editing, fingerprints: v })}
          placeholder="/Banco HSBC/i"
        />

        {/* Skip patterns */}
        <StringArrayField
          label="Patrones a ignorar (regex)"
          values={editing.skipPatterns}
          onChange={(v) => setEditing({ ...editing, skipPatterns: v })}
          placeholder="/SU PAGO/i"
        />

        {/* Advanced */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary"
        >
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Opciones avanzadas
        </button>

        {showAdvanced && (
          <div className="space-y-4 pl-4 border-l-2 border-border/50">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Fin de sección</label>
                <input
                  type="text"
                  value={editing.sectionEnd || ''}
                  onChange={(e) => setEditing({ ...editing, sectionEnd: e.target.value || undefined })}
                  placeholder="Opcional"
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Header de página (multi-página)</label>
                <input
                  type="text"
                  value={editing.pageHeaderPattern || ''}
                  onChange={(e) => setEditing({ ...editing, pageHeaderPattern: e.target.value || undefined })}
                  placeholder="/RESUMEN DE CUENTA/"
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Indent mín. para continuación</label>
                <input
                  type="number"
                  value={editing.continuationMinIndent || ''}
                  onChange={(e) => setEditing({ ...editing, continuationMinIndent: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="6"
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info"
                />
              </div>
            </div>

            <StringArrayField
              label="Limpieza de descripción (regex a eliminar)"
              values={editing.descriptionCleanup || ['']}
              onChange={(v) => setEditing({ ...editing, descriptionCleanup: v })}
              placeholder="/^\d{6}\s+/"
            />

            {/* Dual currency */}
            <div>
              <label className="flex items-center gap-2 text-xs text-text-secondary mb-2">
                <input
                  type="checkbox"
                  checked={!!editing.dualCurrency}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setEditing({ ...editing, dualCurrency: { secondaryCurrency: 'USD', mode: 'column' } });
                    } else {
                      const { dualCurrency: _, ...rest } = editing;
                      setEditing(rest as ParserTemplateData);
                    }
                  }}
                  className="rounded border-border"
                />
                Multi-moneda
              </label>

              {editing.dualCurrency && (
                <div className="grid grid-cols-2 gap-3 ml-5">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Moneda secundaria</label>
                    <select
                      value={editing.dualCurrency.secondaryCurrency}
                      onChange={(e) => setEditing({
                        ...editing,
                        dualCurrency: { ...editing.dualCurrency!, secondaryCurrency: e.target.value as Currency },
                      })}
                      className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Modo</label>
                    <select
                      value={editing.dualCurrency.mode}
                      onChange={(e) => setEditing({
                        ...editing,
                        dualCurrency: { ...editing.dualCurrency!, mode: e.target.value as 'column' | 'section' },
                      })}
                      className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info"
                    >
                      <option value="column">Columnas (ARS | USD en misma línea)</option>
                      <option value="section">Secciones (separadas por título)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Test section */}
        <div className="border-t border-border pt-4 space-y-3">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Probar template</h3>

          <div className="flex gap-2">
            <label className="flex-1">
              <input
                type="file"
                accept=".pdf,.csv,.tsv,.txt"
                onChange={handleTestFile}
                className="hidden"
                id="test-file-input"
              />
              <div
                onClick={() => document.getElementById('test-file-input')?.click()}
                className="px-3 py-2 bg-bg-primary border border-dashed border-border rounded text-xs text-text-muted hover:border-text-muted cursor-pointer text-center transition-colors"
              >
                {testFile ? testFile.name : 'Seleccionar archivo de prueba'}
              </div>
            </label>
            <button
              onClick={handleTest}
              disabled={!testText || testing}
              className={cn(
                'px-4 py-2 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
                testText
                  ? 'bg-accent-info text-white hover:bg-accent-info/90'
                  : 'bg-bg-primary text-text-muted border border-border cursor-not-allowed'
              )}
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
              Probar
            </button>
          </div>

          {!testText && testFile && (
            <div className="flex items-center gap-2 text-xs text-accent-warning">
              <XCircle className="w-3.5 h-3.5" />
              <span>No se pudo extraer texto del archivo. Probá con un CSV o pegá el texto manualmente.</span>
            </div>
          )}

          {/* Manual text paste fallback */}
          <details className="text-xs">
            <summary className="text-text-muted hover:text-text-secondary cursor-pointer">
              O pegar texto del PDF manualmente
            </summary>
            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              rows={6}
              placeholder="Pegar aquí el texto extraído del PDF..."
              className="w-full mt-2 px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info resize-y"
            />
          </details>

          {/* Test results */}
          {testResult && (
            <div className={cn(
              'rounded border p-4 space-y-3',
              testResult.totalTransactions > 0
                ? 'border-accent-positive/30 bg-accent-positive/5'
                : 'border-accent-warning/30 bg-accent-warning/5'
            )}>
              <div className="flex items-center gap-2">
                {testResult.totalTransactions > 0
                  ? <CheckCircle className="w-4 h-4 text-accent-positive" />
                  : <XCircle className="w-4 h-4 text-accent-warning" />
                }
                <span className="text-sm font-medium text-text-primary">
                  {testResult.totalTransactions} transacciones encontradas
                </span>
                <span className="text-xs text-text-muted">
                  ({testResult.lineCount} líneas en sección)
                </span>
              </div>

              {testResult.transactions.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-muted border-b border-border/50">
                      <th className="text-left py-1 pr-2">Fecha</th>
                      <th className="text-left py-1 pr-2">Descripción</th>
                      <th className="text-right py-1 pr-2">Monto</th>
                      <th className="text-left py-1">Mon.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testResult.transactions.slice(0, 10).map((tx, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1 pr-2 text-text-secondary tabular-nums">{tx.date}</td>
                        <td className="py-1 pr-2 text-text-primary truncate max-w-[200px]">{tx.description}</td>
                        <td className={cn(
                          'py-1 pr-2 text-right tabular-nums',
                          tx.amount < 0 ? 'text-accent-negative' : 'text-accent-positive'
                        )}>
                          {tx.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-1 text-text-muted">{tx.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {testResult.totalTransactions > 10 && (
                <p className="text-xs text-text-muted">
                  Mostrando 10 de {testResult.totalTransactions} transacciones
                </p>
              )}
            </div>
          )}
        </div>

        {/* Save / Cancel buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-accent-info text-white rounded text-sm font-medium hover:bg-accent-info/90 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar template
          </button>
          <button
            onClick={cancelEdit}
            className="px-4 py-2.5 bg-bg-primary border border-border text-text-secondary rounded text-sm hover:bg-bg-surface-hover transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ─── Template list ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Templates configurables para parsear documentos de bancos nuevos
        </p>
        <button
          onClick={startNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-info text-white rounded text-xs font-medium hover:bg-accent-info/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo template
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-text-muted">Cargando...</div>
      ) : templates.length === 0 ? (
        <div className="p-8 text-center text-text-muted border border-dashed border-border rounded-lg">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay templates de parseo configurados</p>
          <p className="text-xs mt-1">
            Creá un template para importar documentos de bancos que el sistema no reconoce automáticamente
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-4 bg-bg-surface border border-border rounded-lg hover:border-text-muted/30 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">{t.label}</p>
                <p className="text-xs text-text-muted">
                  {t.institution} · {t.documentType} · {t.dateFormat} · {t.defaultCurrency}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => startEdit(t)}
                  className="text-xs text-accent-info hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-text-muted hover:text-accent-negative transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
