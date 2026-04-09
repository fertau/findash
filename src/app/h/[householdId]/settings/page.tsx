'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import ParserTemplatesTab from './parser-templates';
import ExclusionRulesManager from '@/components/ExclusionRulesManager';

type Tab = 'categories' | 'rules' | 'exclusions' | 'rates' | 'members' | 'cards' | 'parsers';

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Categorías' },
  { id: 'rules', label: 'Reglas' },
  { id: 'exclusions', label: 'Exclusiones' },
  { id: 'rates', label: 'Tipo de cambio' },
  { id: 'members', label: 'Miembros' },
  { id: 'cards', label: 'Tarjetas' },
  { id: 'parsers', label: 'Parsers' },
];

export default function SettingsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const householdId = params.householdId as string;
  const initialTab = (searchParams.get('tab') as Tab) || 'categories';
  const autoNew = searchParams.get('new') === '1';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<Record<string, unknown[]>>({});
  const [loading, setLoading] = useState(false);

  const endpoints: Record<Tab, string> = {
    categories: `/api/households/${householdId}/categories`,
    rules: `/api/households/${householdId}/rules`,
    exclusions: `/api/households/${householdId}/exclusion-rules`,
    rates: `/api/households/${householdId}/exchange-rates`,
    members: `/api/households/${householdId}/members`,
    cards: `/api/households/${householdId}/cards`,
    parsers: `/api/households/${householdId}/parser-templates`,
  };

  const dataKeys: Record<Tab, string> = {
    categories: 'categories',
    rules: 'rules',
    exclusions: 'exclusionRules',
    rates: 'rates',
    members: 'members',
    cards: 'cards',
    parsers: 'parsers',
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoints[activeTab]);
      if (res.ok) {
        const json = await res.json();
        setData((prev) => ({ ...prev, [activeTab]: json[dataKeys[activeTab]] || [] }));
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, householdId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const items = (data[activeTab] || []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Configuración</h1>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Parsers tab — separate component */}
      {activeTab === 'parsers' && (
        <ParserTemplatesTab householdId={householdId} autoNew={autoNew} />
      )}

      {/* Exclusions tab — full CRUD component */}
      {activeTab === 'exclusions' && (
        <ExclusionRulesManager householdId={householdId} />
      )}

      {/* Content — other tabs */}
      {activeTab !== 'parsers' && activeTab !== 'exclusions' && (
        <Card>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No hay {TABS.find((t) => t.id === activeTab)?.label.toLowerCase()} configurados
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {activeTab === 'categories' && (
                    <>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Color</TableHead>
                    </>
                  )}
                  {activeTab === 'rules' && (
                    <>
                      <TableHead>Patrón</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-right">Prioridad</TableHead>
                    </>
                  )}
                  {activeTab === 'rates' && (
                    <>
                      <TableHead>Moneda</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Tasa</TableHead>
                      <TableHead>Fuente</TableHead>
                    </>
                  )}
                  {activeTab === 'members' && (
                    <>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="text-center">Excluido</TableHead>
                    </>
                  )}
                  {activeTab === 'cards' && (
                    <>
                      <TableHead>Origen</TableHead>
                      <TableHead>Últimos 4</TableHead>
                      <TableHead>Miembro</TableHead>
                      <TableHead className="text-center">Excluida</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => (
                  <TableRow key={i}>
                    {activeTab === 'categories' && (
                      <>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: String(item.color || '#95A5A6') }} />
                            <span className="text-foreground">{String(item.name)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{String(item.type)}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{String(item.color)}</TableCell>
                      </>
                    )}
                    {activeTab === 'rules' && (
                      <>
                        <TableCell className="font-mono text-xs">{String(item.pattern)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{String(item.matchType)}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{String(item.categoryId)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{String(item.priority)}</TableCell>
                      </>
                    )}
                    {activeTab === 'rates' && (
                      <>
                        <TableCell>{String(item.currency)}</TableCell>
                        <TableCell className="text-muted-foreground">{String(item.period)}</TableCell>
                        <TableCell className="text-right tabular-nums">{String(item.rate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{String(item.source)}</Badge>
                        </TableCell>
                      </>
                    )}
                    {activeTab === 'members' && (
                      <>
                        <TableCell>{String(item.displayName)}</TableCell>
                        <TableCell className="text-muted-foreground">{String(item.email)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{String(item.role)}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.isExcluded ? <Badge variant="destructive">Sí</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </>
                    )}
                    {activeTab === 'cards' && (
                      <>
                        <TableCell>{String(item.sourceId)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{String(item.lastFour || '—')}</TableCell>
                        <TableCell className="text-muted-foreground">{String(item.memberId)}</TableCell>
                        <TableCell className="text-center">
                          {item.isExcluded ? <Badge variant="destructive">Sí</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
