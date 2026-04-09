'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  fingerprints: [],
  dateFormat: 'DD/MM/YY',
  skipPatterns: [],
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
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/households/${householdId}/parser-templates`);
      if (res.ok) setTemplates(await res.json());
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
    sessionStorage.removeItem('templateBuilderText');
    sessionStorage.removeItem('templateBuilderInstitution');
    sessionStorage.removeItem('templateBuilderFileName');

    const template = emptyTemplate();
    if (prefillInstitution) {
      template.institution = prefillInstitution;
      template.label = `${prefillInstitution} – Documento`;
      template.fingerprints = [`/${prefillInstitution}/i`];
    }

    setEditing(template);
    setIsNew(true);
    setTestResult(null);
    if (prefillText) setTestText(prefillText);
  }, [autoNew, loading]);

  function startNew() {
    setEditing(emptyTemplate());
    setIsNew(true);
    setTestResult(null);
    setTestText('');
    setShowAdvanced(false);
    setShowText(false);
    setError('');
  }

  function startEdit(t: ParserTemplateData & { id: string }) {
    setEditing({ ...t });
    setIsNew(false);
    setTestResult(null);
    setTestText('');
    setShowAdvanced(false);
    setShowText(false);
    setError('');
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const cleaned = {
        ...editing,
        fingerprints: editing.fingerprints.filter((f) => f.trim()),
        skipPatterns: editing.skipPatterns.filter((s) => s.trim()),
        descriptionCleanup: editing.descriptionCleanup?.filter((d) => d.trim()),
      };
      const url = isNew
        ? `/api/households/${householdId}/parser-templates`
        : `/api/households/${householdId}/parser-templates/${editing.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
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

  async function handleTestFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    // Extract text via detect endpoint
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
    } catch { /* ignore */ }
    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleTest() {
    if (!editing || !testText) return;
    setTesting(true);
    setTestResult(null);
    setError('');
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

  // ─── Template Editor ─────────────────────────────────────────────────────────

  if (editing) {
    const hasText = testText.length > 0;

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {isNew ? 'Nuevo template de parseo' : `Editar: ${editing.label}`}
          </h2>
          <button onClick={() => { setEditing(null); setIsNew(false); setError(''); }}
            className="text-xs text-text-muted hover:text-text-secondary">
            Cancelar
          </button>
        </div>

        {error && (
          <div className="p-3 bg-accent-negative/10 border border-accent-negative/20 rounded text-xs text-accent-negative">
            {error}
          </div>
        )}

        {/* ── Essential fields only ── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Nombre</label>
            <input type="text" value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              placeholder="HSBC – Cuenta Corriente"
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Institución</label>
            <input type="text" value={editing.institution}
              onChange={(e) => setEditing({ ...editing, institution: e.target.value })}
              placeholder="HSBC"
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Formato de fecha</label>
            <select value={editing.dateFormat}
              onChange={(e) => setEditing({ ...editing, dateFormat: e.target.value as DateFormatKey })}
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info">
              {DATE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label} ({f.example})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Moneda</label>
            <select value={editing.defaultCurrency}
              onChange={(e) => setEditing({ ...editing, defaultCurrency: e.target.value as Currency })}
              className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Quick toggles */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={editing.negateAmounts}
              onChange={(e) => setEditing({ ...editing, negateAmounts: e.target.checked })}
              className="rounded border-border" />
            Tarjeta de crédito
          </label>
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={editing.hasBalanceColumn}
              onChange={(e) => setEditing({ ...editing, hasBalanceColumn: e.target.checked })}
              className="rounded border-border" />
            Tiene columna de saldo
          </label>
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={editing.hasTrailingMinus}
              onChange={(e) => setEditing({ ...editing, hasTrailingMinus: e.target.checked })}
              className="rounded border-border" />
            Minus al final = crédito
          </label>
        </div>

        {/* ── Test section — prominent when we have pre-loaded text ── */}
        <div className="rounded-lg border border-border bg-bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Probar con documento
            </h3>
            {hasText && (
              <span className="text-xs text-accent-positive flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Texto cargado ({Math.round(testText.length / 1024)}KB)
              </span>
            )}
          </div>

          {!hasText && (
            <div className="space-y-2">
              <input ref={fileInputRef} type="file" accept=".pdf,.csv,.tsv,.txt"
                onChange={handleTestFileSelect} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-3 py-3 bg-bg-primary border border-dashed border-border rounded text-xs text-text-muted hover:border-text-muted cursor-pointer text-center transition-colors"
              >
                Subir un archivo de muestra para probar
              </button>
              <button onClick={() => setShowText(true)}
                className="text-xs text-text-muted hover:text-text-secondary">
                O pegar texto manualmente
              </button>
              {showText && (
                <textarea value={testText} onChange={(e) => setTestText(e.target.value)}
                  rows={4} placeholder="Pegar texto extraído del PDF..."
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info resize-y" />
              )}
            </div>
          )}

          {hasText && (
            <div className="flex gap-2">
              <button onClick={handleTest} disabled={testing}
                className="flex-1 px-4 py-2 bg-accent-info text-white rounded text-xs font-medium hover:bg-accent-info/90 transition-colors flex items-center justify-center gap-1.5">
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
                Probar template
              </button>
              <button onClick={() => { setTestText(''); setTestResult(null); }}
                className="px-3 py-2 text-xs text-text-muted hover:text-text-secondary border border-border rounded transition-colors">
                Cambiar archivo
              </button>
            </div>
          )}

          {/* Test results */}
          {testResult && (
            <div className={cn(
              'rounded border p-3 space-y-2',
              testResult.totalTransactions > 0
                ? 'border-accent-positive/30 bg-accent-positive/5'
                : 'border-accent-warning/30 bg-accent-warning/5'
            )}>
              <div className="flex items-center gap-2">
                {testResult.totalTransactions > 0
                  ? <CheckCircle className="w-4 h-4 text-accent-positive" />
                  : <XCircle className="w-4 h-4 text-accent-warning" />}
                <span className="text-sm font-medium text-text-primary">
                  {testResult.totalTransactions} transacciones
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
                    {testResult.transactions.slice(0, 8).map((tx, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1 pr-2 text-text-secondary tabular-nums">{tx.date}</td>
                        <td className="py-1 pr-2 text-text-primary truncate max-w-[200px]">{tx.description}</td>
                        <td className={cn('py-1 pr-2 text-right tabular-nums',
                          tx.amount < 0 ? 'text-accent-negative' : 'text-accent-positive')}>
                          {tx.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-1 text-text-muted">{tx.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {testResult.totalTransactions > 8 && (
                <p className="text-xs text-text-muted">
                  +{testResult.totalTransactions - 8} más
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Advanced (collapsed) ── */}
        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary">
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Configuración avanzada
        </button>

        {showAdvanced && (
          <div className="space-y-4 pl-4 border-l-2 border-border/50">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Tipo de documento</label>
                <input type="text" value={editing.documentType}
                  onChange={(e) => setEditing({ ...editing, documentType: e.target.value })}
                  placeholder="Cuenta Corriente"
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Inicio de sección</label>
                <input type="text" value={editing.sectionStart || ''}
                  onChange={(e) => setEditing({ ...editing, sectionStart: e.target.value || undefined })}
                  placeholder="Movimientos o /regex/"
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Fin de sección</label>
                <input type="text" value={editing.sectionEnd || ''}
                  onChange={(e) => setEditing({ ...editing, sectionEnd: e.target.value || undefined })}
                  placeholder="Opcional"
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Header de página</label>
                <input type="text" value={editing.pageHeaderPattern || ''}
                  onChange={(e) => setEditing({ ...editing, pageHeaderPattern: e.target.value || undefined })}
                  placeholder="/RESUMEN DE CUENTA/"
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Indent mín. continuación</label>
                <input type="number" value={editing.continuationMinIndent || ''}
                  onChange={(e) => setEditing({ ...editing, continuationMinIndent: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="6"
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info" />
              </div>
            </div>

            {/* Fingerprints */}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Huellas de auto-detección (regex)</label>
              {(editing.fingerprints.length === 0 ? [''] : editing.fingerprints).map((v, idx) => (
                <div key={idx} className="flex gap-2 mb-1">
                  <input type="text" value={v}
                    onChange={(e) => {
                      const next = [...editing.fingerprints];
                      next[idx] = e.target.value;
                      setEditing({ ...editing, fingerprints: next });
                    }}
                    placeholder="/Banco HSBC/i"
                    className="flex-1 px-2 py-1 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info" />
                  {editing.fingerprints.length > 1 && (
                    <button onClick={() => setEditing({ ...editing, fingerprints: editing.fingerprints.filter((_, i) => i !== idx) })}
                      className="text-text-muted hover:text-accent-negative"><Trash2 className="w-3 h-3" /></button>
                  )}
                </div>
              ))}
              <button onClick={() => setEditing({ ...editing, fingerprints: [...editing.fingerprints, ''] })}
                className="text-xs text-accent-info hover:underline">+ Agregar</button>
            </div>

            {/* Skip patterns */}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Líneas a ignorar (regex)</label>
              {(editing.skipPatterns.length === 0 ? [''] : editing.skipPatterns).map((v, idx) => (
                <div key={idx} className="flex gap-2 mb-1">
                  <input type="text" value={v}
                    onChange={(e) => {
                      const next = [...editing.skipPatterns];
                      next[idx] = e.target.value;
                      setEditing({ ...editing, skipPatterns: next });
                    }}
                    placeholder="/SU PAGO/i"
                    className="flex-1 px-2 py-1 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-info" />
                  {editing.skipPatterns.length > 1 && (
                    <button onClick={() => setEditing({ ...editing, skipPatterns: editing.skipPatterns.filter((_, i) => i !== idx) })}
                      className="text-text-muted hover:text-accent-negative"><Trash2 className="w-3 h-3" /></button>
                  )}
                </div>
              ))}
              <button onClick={() => setEditing({ ...editing, skipPatterns: [...editing.skipPatterns, ''] })}
                className="text-xs text-accent-info hover:underline">+ Agregar</button>
            </div>

            {/* Multi-currency */}
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
              <input type="checkbox" checked={!!editing.dualCurrency}
                onChange={(e) => {
                  if (e.target.checked) {
                    setEditing({ ...editing, dualCurrency: { secondaryCurrency: 'USD', mode: 'column' } });
                  } else {
                    const { dualCurrency: _, ...rest } = editing;
                    setEditing(rest as ParserTemplateData);
                  }
                }}
                className="rounded border-border" />
              Multi-moneda
            </label>
            {editing.dualCurrency && (
              <div className="grid grid-cols-2 gap-3 ml-5">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Moneda secundaria</label>
                  <select value={editing.dualCurrency.secondaryCurrency}
                    onChange={(e) => setEditing({
                      ...editing, dualCurrency: { ...editing.dualCurrency!, secondaryCurrency: e.target.value as Currency },
                    })}
                    className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info">
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Modo</label>
                  <select value={editing.dualCurrency.mode}
                    onChange={(e) => setEditing({
                      ...editing, dualCurrency: { ...editing.dualCurrency!, mode: e.target.value as 'column' | 'section' },
                    })}
                    className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-info">
                    <option value="column">Columnas</option>
                    <option value="section">Secciones</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Save ── */}
        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-accent-info text-white rounded text-sm font-medium hover:bg-accent-info/90 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
          <button onClick={() => { setEditing(null); setIsNew(false); }}
            className="px-4 py-2.5 bg-bg-primary border border-border text-text-secondary rounded text-sm hover:bg-bg-surface-hover transition-colors">
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
          Templates para parsear documentos de bancos nuevos
        </p>
        <button onClick={startNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-info text-white rounded text-xs font-medium hover:bg-accent-info/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nuevo
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-text-muted">Cargando...</div>
      ) : templates.length === 0 ? (
        <div className="p-8 text-center text-text-muted border border-dashed border-border rounded-lg">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay templates configurados</p>
          <p className="text-xs mt-1">
            Si importás un documento que el sistema no reconoce, te va a ofrecer crear uno
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id}
              className="flex items-center justify-between p-4 bg-bg-surface border border-border rounded-lg hover:border-text-muted/30 transition-colors">
              <div>
                <p className="text-sm font-medium text-text-primary">{t.label}</p>
                <p className="text-xs text-text-muted">
                  {t.institution} · {t.dateFormat} · {t.defaultCurrency}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(t)} className="text-xs text-accent-info hover:underline">Editar</button>
                <button onClick={() => handleDelete(t.id)} className="text-text-muted hover:text-accent-negative transition-colors">
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
