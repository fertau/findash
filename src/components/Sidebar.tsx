'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowRightLeft, Upload, Settings, Camera, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface SidebarProps {
  householdId: string;
  householdName?: string;
  userName?: string;
}

const NAV_ITEMS = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'transactions', label: 'Transacciones', icon: ArrowRightLeft },
  { href: 'import', label: 'Importar', icon: Upload },
  { href: 'snapshot', label: 'Panorama', icon: Camera },
  { href: 'settings', label: 'Configuración', icon: Settings },
];

export default function Sidebar({ householdId, householdName, userName }: SidebarProps) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    window.location.href = '/login';
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 lg:w-64 md:w-16 bg-card border-r border-border h-screen sticky top-0 shrink-0">
        <div className="p-4 md:px-2 lg:px-4">
          <h2 className="text-lg font-semibold text-foreground hidden lg:block">FinDash</h2>
          <h2 className="text-lg font-semibold text-foreground lg:hidden text-center">F</h2>
        </div>

        <nav className="flex-1 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const href = `/h/${householdId}/${item.href}`;
            const isActive = pathname?.startsWith(href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  'md:justify-center lg:justify-start',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 md:px-2 lg:px-4 space-y-3">
          <Separator />
          {householdName && (
            <p className="text-xs text-muted-foreground truncate hidden lg:block">{householdName}</p>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium shrink-0">
              {userName?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-sm text-muted-foreground truncate hidden lg:inline">{userName}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start md:justify-center lg:justify-start text-muted-foreground hover:text-destructive"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden lg:inline">Salir</span>
          </Button>
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
        <div className="flex justify-around py-2">
          {NAV_ITEMS.slice(0, 4).map((item) => {
            const href = `/h/${householdId}/${item.href}`;
            const isActive = pathname?.startsWith(href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1 text-xs',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label.slice(0, 6)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
