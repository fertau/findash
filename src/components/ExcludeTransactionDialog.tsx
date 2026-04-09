'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2Icon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transaction {
  id: string;
  description: string;
  normalizedDescription: string;
  amount: number;
  currency: string;
  date: string;
  sourceId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  householdId: string;
  onExcluded: () => void;
}

type MatchType = 'contains' | 'exact' | 'regex';

type Mode = 'single' | 'rule';

// ---------------------------------------------------------------------------
// LATAM pattern suggestions
// ---------------------------------------------------------------------------

const LATAM_SUGGESTIONS: { pattern: string; reason: string }[] = [
  { pattern: 'FIMA', reason: 'Suscripcion/rescate fondo de inversion' },
  { pattern: 'PAGO TARJETA', reason: 'Pago de tarjeta (evita duplicacion)' },
  { pattern: 'PAGO TC', reason: 'Pago de tarjeta (evita duplicacion)' },
  {
    pattern: 'PERIODO DE MOVIMIENTOS',
    reason: 'Linea de encabezado del extracto',
  },
  { pattern: 'SALDO ANTERIOR', reason: 'Linea informativa del extracto' },
  {
    pattern: 'IMPUESTO DEBITOS',
    reason: 'Impuesto (excluido del analisis)',
  },
  { pattern: 'IMP.SEL.', reason: 'Impuesto sobre debitos/creditos' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip numbers, dates, cuota info and extra whitespace from a description. */
function smartExtractPattern(normalized: string): string {
  return normalized
    .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, '') // dates
    .replace(/CUOTA\s*\d+[\/\-]?\d*/gi, '') // cuota info
    .replace(/\d+/g, '') // remaining numbers
    .replace(/\s{2,}/g, ' ') // collapse spaces
    .trim();
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExcludeTransactionDialog({
  open,
  onOpenChange,
  transaction,
  householdId,
  onExcluded,
}: Props) {
  const [mode, setMode] = useState<Mode>('single');
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('contains');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [addToTemplate, setAddToTemplate] = useState(false);

  // Reset state when the dialog opens with a new transaction
  useEffect(() => {
    if (open && transaction) {
      setMode('single');
      setPattern(smartExtractPattern(transaction.normalizedDescription));
      setMatchType('contains');
      setReason('');
      setLoading(false);
      setAddToTemplate(false);
    }
  }, [open, transaction]);

  // Auto-suggest reason from LATAM patterns when the pattern field changes
  const suggestedReason = useMemo(() => {
    if (!pattern) return '';
    const upper = pattern.toUpperCase();
    const match = LATAM_SUGGESTIONS.find((s) => upper.includes(s.pattern));
    return match?.reason ?? '';
  }, [pattern]);

  // Use suggested reason as default when user hasn't typed one
  const effectiveReason = reason || suggestedReason;

  const handleSuggestionClick = useCallback(
    (suggestion: { pattern: string; reason: string }) => {
      setPattern(suggestion.pattern);
      setReason(suggestion.reason);
      setMatchType('contains');
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!transaction) return;
    setLoading(true);

    try {
      if (mode === 'single') {
        // Exclude just this transaction
        await fetch(
          `/api/households/${householdId}/transactions/${transaction.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              isExcluded: true,
              exclusionReason: effectiveReason || undefined,
            }),
          },
        );
      } else {
        // Create exclusion rule
        await fetch(`/api/households/${householdId}/exclusion-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pattern,
            matchType,
            reason: effectiveReason || undefined,
            isActive: true,
          }),
        });

        // Apply all rules to existing transactions
        await fetch(`/api/households/${householdId}/exclusion-rules/apply`, {
          method: 'POST',
        });
      }

      // Feed pattern back to parser template's skipPatterns
      if (addToTemplate && transaction.sourceId?.startsWith('template_')) {
        const templateId = transaction.sourceId.replace('template_', '');
        try {
          // Get current template
          const tplRes = await fetch(
            `/api/households/${householdId}/parser-templates/${templateId}`,
          );
          if (tplRes.ok) {
            const tplData = await tplRes.json();
            const currentSkip: string[] = tplData.skipPatterns || [];
            const newSkipPattern = matchType === 'regex' ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!currentSkip.includes(newSkipPattern)) {
              await fetch(
                `/api/households/${householdId}/parser-templates/${templateId}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    skipPatterns: [...currentSkip, newSkipPattern],
                  }),
                },
              );
            }
          }
        } catch {
          // Non-critical — template update failed, exclusion still applied
        }
      }

      onExcluded();
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to exclude transaction:', err);
    } finally {
      setLoading(false);
    }
  }, [
    transaction,
    mode,
    householdId,
    pattern,
    matchType,
    effectiveReason,
    onExcluded,
    onOpenChange,
  ]);

  if (!transaction) return null;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Excluir transaccion</DialogTitle>
        </DialogHeader>

        {/* Transaction summary */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground truncate">
            {transaction.description}
          </p>
          <div className="mt-1 flex items-center gap-3 text-muted-foreground">
            <span>{formatAmount(transaction.amount, transaction.currency)}</span>
            <span>{formatDate(transaction.date)}</span>
          </div>
        </div>

        {/* Mode selector */}
        <fieldset className="space-y-2">
          <legend className="sr-only">Modo de exclusion</legend>

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
              mode === 'single'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name="exclude-mode"
              value="single"
              checked={mode === 'single'}
              onChange={() => setMode('single')}
              className="accent-primary size-4"
            />
            <div>
              <span className="font-medium text-foreground">
                Solo esta transaccion
              </span>
              <p className="text-xs text-muted-foreground">
                Excluye unicamente esta transaccion del analisis
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
              mode === 'rule'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name="exclude-mode"
              value="rule"
              checked={mode === 'rule'}
              onChange={() => setMode('rule')}
              className="accent-primary size-4"
            />
            <div>
              <span className="font-medium text-foreground">
                Crear regla de exclusion
              </span>
              <p className="text-xs text-muted-foreground">
                Aplica a transacciones futuras y existentes que coincidan
              </p>
            </div>
          </label>
        </fieldset>

        {/* Rule configuration (visible only in rule mode) */}
        {mode === 'rule' && (
          <div className="space-y-3">
            {/* Pattern */}
            <div className="space-y-1.5">
              <label
                htmlFor="excl-pattern"
                className="text-xs font-medium text-muted-foreground"
              >
                Patron
              </label>
              <Input
                id="excl-pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="Texto a buscar..."
              />
            </div>

            {/* Match type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Tipo de coincidencia
              </label>
              <Select
                value={matchType}
                onValueChange={(val) => setMatchType(val as MatchType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contiene</SelectItem>
                  <SelectItem value="exact">Exacto</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label
                htmlFor="excl-reason"
                className="text-xs font-medium text-muted-foreground"
              >
                Razon
              </label>
              <Input
                id="excl-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={suggestedReason || 'Motivo de la exclusion...'}
              />
            </div>

            {/* Feed back to parser template */}
            {transaction.sourceId?.startsWith('template_') && (
              <label className="flex items-center gap-2 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={addToTemplate}
                  onChange={(e) => setAddToTemplate(e.target.checked)}
                  className="size-4 rounded accent-primary"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">
                    Agregar al template del parser
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Líneas con este patrón se descartarán automáticamente en futuras importaciones
                  </p>
                </div>
              </label>
            )}

            {/* LATAM suggestion chips */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Sugerencias
              </span>
              <div className="flex flex-wrap gap-1.5">
                {LATAM_SUGGESTIONS.map((s) => (
                  <Badge
                    key={s.pattern}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted"
                    render={
                      <button
                        type="button"
                        onClick={() => handleSuggestionClick(s)}
                      />
                    }
                  >
                    {s.pattern}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Reason field for single mode too */}
        {mode === 'single' && (
          <div className="space-y-1.5">
            <label
              htmlFor="excl-reason-single"
              className="text-xs font-medium text-muted-foreground"
            >
              Razon (opcional)
            </label>
            <Input
              id="excl-reason-single"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo de la exclusion..."
            />
          </div>
        )}

        {/* Actions */}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {mode === 'rule' ? 'Excluir y crear regla' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
