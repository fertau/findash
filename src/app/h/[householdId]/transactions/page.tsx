'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Transaction, Currency } from '@/lib/db/types';

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

  const period = searchParams.get('period') || '';
  const categoryId = searchParams.get('categoryId') || '';

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (period) params.set('period', period);
    if (categoryId) params.set('categoryId', categoryId);
    params.set('isExcluded', 'false');

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

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Transacciones</h1>
        <span className="text-sm text-muted-foreground">{total} resultados</span>
      </div>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <div className="h-4 bg-muted rounded animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-8 text-center text-muted-foreground">
                    No hay transacciones para este período
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-muted-foreground tabular-nums">{tx.date}</TableCell>
                    <TableCell className="text-foreground truncate max-w-xs">{tx.description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {tx.categoryId.replace('cat_', '').replace(/_/g, ' ')}
                      </Badge>
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
    </div>
  );
}
