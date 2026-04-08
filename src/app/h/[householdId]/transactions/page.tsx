'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
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
        <h1 className="text-xl font-semibold text-text-primary">Transacciones</h1>
        <span className="text-sm text-text-muted">{total} resultados</span>
      </div>

      {/* Table */}
      <div className="bg-bg-surface rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs uppercase">
              <th className="text-left p-3 font-medium">Fecha</th>
              <th className="text-left p-3 font-medium">Descripción</th>
              <th className="text-left p-3 font-medium">Categoría</th>
              <th className="text-right p-3 font-medium">Monto</th>
              <th className="text-center p-3 font-medium">Cuota</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td colSpan={5} className="p-3">
                    <div className="h-4 bg-bg-surface-hover rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-text-muted">
                  No hay transacciones para este período
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border/50 hover:bg-bg-surface-hover transition-colors">
                  <td className="p-3 text-text-secondary tabular-nums whitespace-nowrap">{tx.date}</td>
                  <td className="p-3 text-text-primary truncate max-w-xs">{tx.description}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-bg-surface-hover text-text-secondary">
                      {tx.categoryId.replace('cat_', '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums text-text-primary whitespace-nowrap">
                    {formatAmount(tx.amount, tx.currency)}
                  </td>
                  <td className="p-3 text-center">
                    {tx.installment && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-accent-info/10 text-accent-info tabular-nums">
                        {tx.installment.current}/{tx.installment.total}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-xs text-text-muted">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
