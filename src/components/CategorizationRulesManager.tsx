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
import type { CategorizationRule, RuleMatchType, Category } from '@/lib/db/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  householdId: string;
}

interface ApplyResult {
  updated: number;
  categorized: number;
  stillUncategorized: number;
}

interface FormState {
  pattern: string;
  matchType: RuleMatchType;
  categoryId: string;
  priority: number;
}

const EMPTY_FORM: FormState = {
  pattern: '',
  matchType: 'contains',
  categoryId: '',
  priority: 100,
};

const MATCH_TYPE_LABELS: Record<RuleMatchType, string> = {
  exact: 'Exacto',
  contains: 'Contiene',
  regex: 'Regex',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CategorizationRulesManager({ householdId }: Props) {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<CategorizationRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rulesUrl = `/api/households/${householdId}/rules`;
  const categoriesUrl = `/api/households/${householdId}/categories`;

  // ── Fetch categories ─────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(categoriesUrl);
      if (!res.ok) throw new Error('Failed to fetch categories');
      const data = await res.json();
      setCategories(data.categories ?? []);
    } catch {
      // silently fail
    }
  }, [categoriesUrl]);

  // ── Fetch rules ──────────────────────────────────────────────────────────

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(rulesUrl);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch {
      // silently fail — user sees empty table
    } finally {
      setLoading(false);
    }
  }, [rulesUrl]);

  useEffect(() => {
    fetchCategories();
    fetchRules();
  }, [fetchCategories, fetchRules]);

  // ── Category helpers ─────────────────────────────────────────────────────

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const fijoCategories = categories
    .filter((c) => c.type === 'Fijo')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const variableCategories = categories
    .filter((c) => c.type === 'Variable')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // ── Create / Update ──────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (rule: CategorizationRule) => {
    setEditingRule(rule);
    setForm({
      pattern: rule.pattern,
      matchType: rule.matchType,
      categoryId: rule.categoryId,
      priority: rule.priority,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingRule) {
        const res = await fetch(`${rulesUrl}/${editingRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error('Failed to update');
      } else {
        const res = await fetch(rulesUrl, {
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

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${rulesUrl}/${deleteTarget.id}`, {
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
      const res = await fetch(`${rulesUrl}/apply`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to apply');
      const data: ApplyResult = await res.json();
      setApplyResult(data);
    } catch {
      // TODO: show toast
    } finally {
      setApplying(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const canSave = form.pattern.trim().length > 0 && form.categoryId.length > 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Reglas de categorizacion</CardTitle>
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
                <strong>{applyResult.categorized}</strong> categorizadas,{' '}
                <strong>{applyResult.stillUncategorized}</strong> sin categorizar
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
              No hay reglas de categorizacion. Crea una para comenzar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patron</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-center">Prioridad</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => {
                    const cat = categoryMap.get(rule.categoryId);
                    return (
                      <TableRow key={rule.id}>
                        <TableCell className="font-mono text-sm">
                          {rule.pattern}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {MATCH_TYPE_LABELS[rule.matchType]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cat ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-block size-2.5 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="text-sm">{cat.name}</span>
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {rule.categoryId}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {rule.priority}
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
                    );
                  })}
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
              {editingRule ? 'Editar regla' : 'Nueva regla de categorizacion'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Pattern */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Patron
              </label>
              <Input
                placeholder="Ej: SPOTIFY, MERCADOLIBRE..."
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

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Categoria
              </label>
              <Select
                value={form.categoryId}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, categoryId: v ?? '' }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar categoria..." />
                </SelectTrigger>
                <SelectContent>
                  {fijoCategories.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Fijo
                      </div>
                      {fijoCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block size-2.5 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {variableCategories.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Variable
                      </div>
                      {variableCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block size-2.5 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Prioridad
              </label>
              <Input
                type="number"
                placeholder="100"
                value={form.priority}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    priority: parseInt(e.target.value, 10) || 0,
                  }))
                }
              />
            </div>
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
