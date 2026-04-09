'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Play, X } from 'lucide-react';
import type { ExclusionRule, RuleMatchType } from '@/lib/db/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  householdId: string;
}

interface ApplyResult {
  updated: number;
  excluded: number;
  unexcluded: number;
}

interface FormState {
  pattern: string;
  matchType: RuleMatchType;
  reason: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  pattern: '',
  matchType: 'contains',
  reason: '',
  isActive: true,
};

// ---------------------------------------------------------------------------
// LATAM suggestion chips
// ---------------------------------------------------------------------------

const SUGGESTIONS: { pattern: string; reason: string }[] = [
  { pattern: 'FIMA', reason: 'Suscripcion/rescate fondo de inversion' },
  { pattern: 'PAGO TARJETA', reason: 'Pago de tarjeta (evita duplicacion)' },
  { pattern: 'PAGO TC', reason: 'Pago de tarjeta (evita duplicacion)' },
  { pattern: 'PERIODO DE MOVIMIENTOS', reason: 'Linea de encabezado del extracto' },
  { pattern: 'SALDO ANTERIOR', reason: 'Linea informativa del extracto' },
  { pattern: 'IMPUESTO DEBITOS', reason: 'Impuesto (excluido del analisis)' },
  { pattern: 'IMP.SEL.', reason: 'Impuesto sobre debitos/creditos' },
];

const MATCH_TYPE_LABELS: Record<RuleMatchType, string> = {
  exact: 'Exacto',
  contains: 'Contiene',
  regex: 'Regex',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExclusionRulesManager({ householdId }: Props) {
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ExclusionRule | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ExclusionRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const baseUrl = `/api/households/${householdId}/exclusion-rules`;

  // ── Fetch rules ──────────────────────────────────────────────────────────

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(baseUrl);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRules(data.exclusionRules ?? []);
    } catch {
      // silently fail — user sees empty table
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // ── Create / Update ──────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (rule: ExclusionRule) => {
    setEditingRule(rule);
    setForm({
      pattern: rule.pattern,
      matchType: rule.matchType,
      reason: rule.reason,
      isActive: rule.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingRule) {
        const res = await fetch(`${baseUrl}/${editingRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error('Failed to update');
      } else {
        const res = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error('Failed to create');
      }
      setDialogOpen(false);
      await fetchRules();
    } catch {
      // TODO: show toast
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle active ────────────────────────────────────────────────────────

  const toggleActive = async (rule: ExclusionRule) => {
    try {
      const res = await fetch(`${baseUrl}/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)),
      );
    } catch {
      // TODO: show toast
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${baseUrl}/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      setDeleteTarget(null);
      await fetchRules();
    } catch {
      // TODO: show toast
    } finally {
      setDeleting(false);
    }
  };

  // ── Apply rules ──────────────────────────────────────────────────────────

  const handleApply = async () => {
    setApplying(true);
    setApplyResult(null);
    try {
      const res = await fetch(`${baseUrl}/apply`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to apply');
      const data: ApplyResult = await res.json();
      setApplyResult(data);
    } catch {
      // TODO: show toast
    } finally {
      setApplying(false);
    }
  };

  // ── Suggestion chip handler ──────────────────────────────────────────────

  const applySuggestion = (s: { pattern: string; reason: string }) => {
    setForm((prev) => ({ ...prev, pattern: s.pattern, reason: s.reason }));
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const canSave = form.pattern.trim().length > 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Reglas de exclusion</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleApply}
              disabled={applying || rules.length === 0}
            >
              <Play className="mr-1.5 size-4" />
              {applying ? 'Aplicando...' : 'Aplicar reglas'}
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              Nueva regla
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Apply result banner */}
          {applyResult && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
              <span className="text-foreground">
                <strong>{applyResult.updated}</strong> actualizadas,{' '}
                <strong>{applyResult.excluded}</strong> excluidas,{' '}
                <strong>{applyResult.unexcluded}</strong> rehabilitadas
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setApplyResult(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando reglas...
            </p>
          ) : rules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay reglas de exclusion. Crea una para comenzar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patron</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Razon</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-mono text-sm">
                        {rule.pattern}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {MATCH_TYPE_LABELS[rule.matchType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {rule.reason}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={
                            rule.isActive
                              ? 'text-emerald-500 hover:text-emerald-600'
                              : 'text-muted-foreground hover:text-foreground'
                          }
                          onClick={() => toggleActive(rule)}
                        >
                          {rule.isActive ? 'Si' : 'No'}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(rule)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(rule)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create / Edit dialog ──────────────────────────────────────────── */}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Editar regla' : 'Nueva regla de exclusion'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Suggestion chips — only on create */}
            {!editingRule && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Sugerencias LATAM
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.pattern}
                      type="button"
                      onClick={() => applySuggestion(s)}
                      className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-muted"
                    >
                      {s.pattern}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pattern */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Patron
              </label>
              <Input
                placeholder="Ej: FIMA, PAGO TARJETA..."
                value={form.pattern}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, pattern: e.target.value }))
                }
              />
            </div>

            {/* Match type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Tipo de coincidencia
              </label>
              <Select
                value={form.matchType}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    matchType: v as RuleMatchType,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exacto</SelectItem>
                  <SelectItem value="contains">Contiene</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Razon
              </label>
              <Input
                placeholder="Motivo de la exclusion..."
                value={form.reason}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, reason: e.target.value }))
                }
              />
            </div>

            {/* Is active */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                }
                className="size-4 rounded border-border accent-primary"
              />
              <span className="text-sm text-foreground">Regla activa</span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving
                ? 'Guardando...'
                : editingRule
                  ? 'Guardar cambios'
                  : 'Crear regla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ────────────────────────────────────── */}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar regla</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Estas seguro de que deseas eliminar la regla{' '}
            <span className="font-mono font-medium text-foreground">
              {deleteTarget?.pattern}
            </span>
            ? Esta accion no se puede deshacer.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
