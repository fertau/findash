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
  categoryId: string;
  categoryMatchType: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
  color: string;
  parentId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  categories: Category[];
  householdId: string;
  onCategorized: () => void;
}

type MatchType = 'contains' | 'exact' | 'regex';

type Mode = 'single' | 'rule';

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

export default function CategorizeTransactionDialog({
  open,
  onOpenChange,
  transaction,
  categories,
  householdId,
  onCategorized,
}: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [mode, setMode] = useState<Mode>('single');
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('contains');
  const [priority, setPriority] = useState(100);
  const [loading, setLoading] = useState(false);

  // Reset state when the dialog opens with a new transaction
  useEffect(() => {
    if (open && transaction) {
      setSelectedCategoryId(transaction.categoryId || '');
      setMode('single');
      setPattern(smartExtractPattern(transaction.normalizedDescription));
      setMatchType('contains');
      setPriority(100);
      setLoading(false);
    }
  }, [open, transaction]);

  // Group categories by type (parent categories act as groups)
  const groupedCategories = useMemo(() => {
    const parents = categories.filter((c) => !c.parentId);
    const children = categories.filter((c) => c.parentId);

    // Build groups: each parent with its children
    const groups: { label: string; type: string; items: Category[] }[] = [];

    for (const parent of parents) {
      const childCats = children.filter((c) => c.parentId === parent.id);
      // Include parent itself as a selectable item plus its children
      groups.push({
        label: parent.name,
        type: parent.type,
        items: [parent, ...childCats],
      });
    }

    // Also include orphan categories (no parent, no children pointing to them)
    const parentIds = new Set(parents.map((p) => p.id));
    const orphans = categories.filter(
      (c) => !c.parentId && !children.some((ch) => ch.parentId === c.id),
    );
    // These are already in parents — filter to only true orphans (parents with no children)
    // They are already included above, so no extra handling needed.

    // If there are no parent/child relationships, group by type
    if (groups.length === 0) {
      const byType = new Map<string, Category[]>();
      for (const cat of categories) {
        const existing = byType.get(cat.type) || [];
        existing.push(cat);
        byType.set(cat.type, existing);
      }
      for (const [type, items] of byType) {
        groups.push({ label: type, type, items });
      }
    }

    return groups;
  }, [categories]);

  // Current category name for display
  const currentCategory = useMemo(
    () => categories.find((c) => c.id === transaction?.categoryId),
    [categories, transaction?.categoryId],
  );

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!transaction || !selectedCategoryId) return;
    setLoading(true);

    try {
      if (mode === 'single') {
        // Re-categorize just this transaction
        await fetch(
          `/api/households/${householdId}/transactions/${transaction.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryId: selectedCategoryId }),
          },
        );
      } else {
        // Create categorization rule
        await fetch(`/api/households/${householdId}/rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pattern,
            matchType,
            categoryId: selectedCategoryId,
            priority,
          }),
        });

        // Re-apply all rules to existing transactions
        await fetch(`/api/households/${householdId}/rules/apply`, {
          method: 'POST',
        });
      }

      onCategorized();
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to categorize transaction:', err);
    } finally {
      setLoading(false);
    }
  }, [
    transaction,
    selectedCategoryId,
    mode,
    householdId,
    pattern,
    matchType,
    priority,
    onCategorized,
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
          <DialogTitle>Categorizar transaccion</DialogTitle>
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
          {currentCategory && (
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                <span
                  className="mr-1.5 inline-block size-2 rounded-full"
                  style={{ backgroundColor: currentCategory.color }}
                />
                {currentCategory.name}
              </Badge>
            </div>
          )}
        </div>

        {/* Category selector */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground">
            Nueva categoría
          </label>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Cargando categorías...
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-3 pr-1 border border-border rounded-lg p-3">
              {groupedCategories.map((group) => (
                <div key={group.label}>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {group.items.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                          selectedCategoryId === cat.id
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        }`}
                      >
                        <span
                          className="inline-block size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="truncate">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mode selector */}
        <fieldset className="space-y-2">
          <legend className="sr-only">Modo de categorizacion</legend>

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
              mode === 'single'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name="categorize-mode"
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
                Cambia la categoria unicamente de esta transaccion
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
              name="categorize-mode"
              value="rule"
              checked={mode === 'rule'}
              onChange={() => setMode('rule')}
              className="accent-primary size-4"
            />
            <div>
              <span className="font-medium text-foreground">
                Crear regla de categorizacion
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
                htmlFor="cat-pattern"
                className="text-xs font-medium text-muted-foreground"
              >
                Patron
              </label>
              <Input
                id="cat-pattern"
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

            {/* Priority */}
            <div className="space-y-1.5">
              <label
                htmlFor="cat-priority"
                className="text-xs font-medium text-muted-foreground"
              >
                Prioridad
              </label>
              <Input
                id="cat-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                min={0}
                placeholder="100"
              />
            </div>
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
          <Button
            onClick={handleSubmit}
            disabled={loading || !selectedCategoryId}
          >
            {loading && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {mode === 'rule' ? 'Guardar y crear regla' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
