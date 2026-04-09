'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Ban, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ExcludeTransactionDialog from '@/components/ExcludeTransactionDialog';
import CategorizeTransactionDialog from '@/components/CategorizeTransactionDialog';
import type { Transaction, Currency, Category } from '@/lib/db/types';

function formatAmount(amount: number, currency: Currency): string {
  if (currency === 'ARS') return `ARS ${amount.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
  if (currency === 'UYU') return `UYU ${amount.toLocaleString('es-UY', { minimumFractionDigits: 0 })}`;
  return `USD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function TransactionsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const householdId = params.householdId as string;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 50;

  const [excludeDialogOpen, setExcludeDialogOpen] = useState(false);
  const [excludeTarget, setExcludeTarget] = useState<Transaction | null>(null);
  const [categorizeDialogOpen, setCategorizeDialogOpen] = useState(false);
  const [categorizeTarget, setCategorizeTarget] = useState<Transaction | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [aiBanner, setAiBanner] = useState<string | null>(null);

  const period = searchParams.get('period') || '';
  const categoryId = searchParams.get('categoryId') || '';

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    params.set('isExcluded', 'false');
    if (period) params.set('period', period);
    if (categoryId) params.set('categoryId', categoryId);

    try {
      const res = await fetch(`/api/households/${householdId}/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.items);
        setTotal(data.pagination.total);
      }
    } finally {
      setLoading(false);
    }
  }, [householdId, page, period, categoryId]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  // Fetch categories for the categorize dialog (flatten tree)
  useEffect(() => {
    fetch(`/api/households/${householdId}/categories`)
      .then((res) => res.ok ? res.json() : { categories: [] })
      .then((data) => {
        const tree = data.categories || [];
        // Flatten the tree: parents + children
        const flat: Category[] = [];
        for (const node of tree) {
          const { children, ...parent } = node;
          flat.push(parent as Category);
          if (Array.isArray(children)) {
            for (const child of children) {
              const { children: _, ...c } = child;
              flat.push(c as Category);
            }
          }
        }
        setCategories(flat);
      })
      .catch(() => {});
  }, [householdId]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Transacciones</h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={aiCategorizing}
            onClick={async () => {
              setAiCategorizing(true);
              setAiBanner(null);
              try {
                const res = await fetch(`/api/households/${householdId}/transactions/ai-categorize`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ scope: 'uncategorized' }),
                });
                if (res.ok) {
                  const data = await res.json();
                  fetchTransactions();
                  if (data.processed === 0) {
                    setAiBanner('No hay transacciones sin categorizar');
                  } else {
                    setAiBanner(`AI categorizó ${data.categorized} de ${data.processed} transacciones`);
                  }
                } else if (res.status === 400) {
                  setAiBanner('API key no configurada');
                } else {
                  setAiBanner('Error al categorizar');
                }
              } catch {
                setAiBanner('Error al categorizar');
              } finally {
                setAiCategorizing(false);
                setTimeout(() => setAiBanner(null), 5000);
              }
            }}
          >
            {aiCategorizing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Sparkles className="mr-1.5 size-4" />}
            {aiCategorizing ? 'Categorizando...' : 'Categorizar con AI'}
          </Button>
          <span className="text-sm text-muted-foreground">{total} resultados</span>
        </div>
      </div>

      {aiBanner && (
        <div className="rounded-md bg-primary/10 border border-primary/20 px-4 py-2 text-sm text-foreground">
          {aiBanner}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase">Fecha</TableHead>
                <TableHead className="text-xs uppercase">Descripción</TableHead>
                <TableHead className="text-xs uppercase">Categoría</TableHead>
                <TableHead className="text-xs uppercase text-right">Monto</TableHead>
                <TableHead className="text-xs uppercase text-center">Cuota</TableHead>
                <TableHead className="text-xs uppercase text-center w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <div className="h-4 bg-muted rounded animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-8 text-center text-muted-foreground">
                    No hay transacciones para este período
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-muted-foreground tabular-nums">{tx.date}</TableCell>
                    <TableCell className="text-foreground truncate max-w-xs">{tx.description}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => {
                          setCategorizeTarget(tx);
                          setCategorizeDialogOpen(true);
                        }}
                        className="cursor-pointer text-left"
                        title="Cambiar categoría"
                      >
                        <Badge variant="secondary" className="hover:bg-muted transition-colors">
                          {(() => {
                            const cat = categories.find((c) => c.id === tx.categoryId);
                            return cat ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: cat.color }} />
                                {cat.name}
                                {tx.categoryMatchType === 'ai' && <Sparkles className="size-3 text-amber-400" />}
                              </span>
                            ) : (
                              tx.categoryId.replace('cat_', '').replace(/_/g, ' ')
                            );
                          })()}
                        </Badge>
                        {tx.categoryReason && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] truncate">
                            {tx.categoryReason}
                          </p>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatAmount(tx.amount, tx.currency)}
                    </TableCell>
                    <TableCell className="text-center">
                      {tx.installment && (
                        <Badge variant="outline" className="tabular-nums">
                          {tx.installment.current}/{tx.installment.total}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setExcludeTarget(tx);
                          setExcludeDialogOpen(true);
                        }}
                        title="Excluir"
                      >
                        <Ban className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <ExcludeTransactionDialog
        open={excludeDialogOpen}
        onOpenChange={setExcludeDialogOpen}
        transaction={excludeTarget}
        householdId={householdId}
        onExcluded={() => fetchTransactions()}
      />
      <CategorizeTransactionDialog
        open={categorizeDialogOpen}
        onOpenChange={setCategorizeDialogOpen}
        transaction={categorizeTarget}
        categories={categories}
        householdId={householdId}
        onCategorized={() => fetchTransactions()}
      />
    </div>
  );
}
