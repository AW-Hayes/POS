import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useTerminalStore } from '@/stores/terminal';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, ClipboardList,
  Users, Settings, LogOut, ShoppingBag, BarChart3, Building2,
  Truck, Tag, Layers, CreditCard, FileText, Archive, Clock, ChevronDown,
  DollarSign, RotateCcw, ClipboardCheck, Wrench, PackageOpen, Menu, X, Sun, Moon, ArrowRightLeft,
} from 'lucide-react';

// ── Theme hook ────────────────────────────────────────────────────────────────

function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

// ── Nav config ────────────────────────────────────────────────────────────────

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  minRole?: 'manager' | 'admin';
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const allGroups: NavGroup[] = [
  {
    label: 'Sales',
    items: [
      { to: '/orders',          label: 'Orders',          icon: ClipboardList },
      { to: '/returns',         label: 'Returns',         icon: RotateCcw },
      { to: '/estimates',       label: 'Estimates',       icon: FileText },
      { to: '/layaway',         label: 'Layaway',         icon: Archive },
      { to: '/service-tickets', label: 'Service Tickets', icon: Wrench },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/products',     label: 'Products',     icon: Package,      minRole: 'manager' },
      { to: '/bundles',      label: 'Bundles',      icon: PackageOpen,  minRole: 'manager' },
      { to: '/inventory',    label: 'Inventory',    icon: Warehouse,    minRole: 'manager' },
      { to: '/cycle-counts', label: 'Cycle Counts', icon: ClipboardCheck, minRole: 'manager' },
      { to: '/promotions',   label: 'Promotions',   icon: Tag,          minRole: 'manager' },
      { to: '/price-levels', label: 'Price Levels', icon: Layers,       minRole: 'manager' },
      { to: '/gift-cards',   label: 'Gift Cards',   icon: CreditCard,   minRole: 'manager' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { to: '/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { to: '/vendors',           label: 'Vendors',          icon: Building2,    minRole: 'manager' },
      { to: '/purchase-orders',   label: 'Purchase Orders',  icon: Truck,        minRole: 'manager' },
      { to: '/stock-transfers',   label: 'Stock Transfers',  icon: ArrowRightLeft, minRole: 'manager' },
    ],
  },
  {
    label: 'Team',
    items: [
      { to: '/time-clock', label: 'Time Clock', icon: Clock },
      { to: '/reports',    label: 'Reports',    icon: BarChart3, minRole: 'manager' },
    ],
  },
];

const roleLevel = { cashier: 0, manager: 1, admin: 2 } as const;

// ── EOD data ──────────────────────────────────────────────────────────────────

const BILLS = [
  { label: '$100', value: 100 },
  { label: '$50',  value: 50  },
  { label: '$20',  value: 20  },
  { label: '$10',  value: 10  },
  { label: '$5',   value: 5   },
  { label: '$1',   value: 1   },
];

const COINS = [
  { label: 'Quarters ($0.25)', value: 0.25 },
  { label: 'Dimes ($0.10)',    value: 0.10 },
  { label: 'Nickels ($0.05)', value: 0.05 },
  { label: 'Pennies ($0.01)', value: 0.01 },
];

type DenomCounts = Record<string, number>;

function calcCashFromDenoms(counts: DenomCounts): number {
  let total = 0;
  for (const denom of [...BILLS, ...COINS]) {
    total += (counts[String(denom.value)] ?? 0) * denom.value;
  }
  return Math.round(total * 100) / 100;
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────

function SideNavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          isActive
            ? 'bg-amber-500 text-zinc-950'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </NavLink>
  );
}

// ── Sidebar content (shared between desktop + mobile drawer) ──────────────────

function SidebarContent({
  visibleGroups,
  onNav,
  dark,
  onThemeToggle,
  user,
  sessionId,
  onOpenEod,
  onOpenCashMgmt,
  onLogout,
}: {
  visibleGroups: (NavGroup & { visibleItems: NavItem[] })[];
  onNav?: () => void;
  dark: boolean;
  onThemeToggle: () => void;
  user: { name?: string; role?: string } | null;
  sessionId: string | null | undefined;
  onOpenEod: () => void;
  onOpenCashMgmt: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-zinc-800 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-amber-500 flex items-center justify-center">
          <ShoppingBag className="h-4 w-4 text-zinc-950" />
        </div>
        <span className="font-semibold text-base tracking-tight">RetailOS</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3 space-y-0.5">
        {/* Top-level: Dashboard + Terminal */}
        <NavLink
          to="/"
          end
          onClick={onNav}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-amber-500 text-zinc-950'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
            )
          }
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Dashboard
        </NavLink>

        <NavLink
          to="/terminal"
          onClick={onNav}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-amber-500 text-zinc-950'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
            )
          }
        >
          <ShoppingCart className="h-4 w-4 shrink-0" />
          Terminal
        </NavLink>

        {/* Grouped sections */}
        {visibleGroups.map((group) => (
          <div key={group.label} className="pt-4">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              {group.label}
            </p>
            {group.visibleItems.map((item) => (
              <SideNavLink key={item.to} item={item} onClick={onNav} />
            ))}
          </div>
        ))}

        {/* Settings */}
        <div className="pt-4">
          <NavLink
            to="/settings"
            onClick={onNav}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-amber-500 text-zinc-950'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
              )
            }
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </NavLink>
        </div>
      </nav>

      {/* Footer */}
      <div className="shrink-0 px-3 pb-3 space-y-1 border-t border-zinc-800 pt-3">
        {/* Session actions */}
        {sessionId && (
          <>
            <button
              onClick={onOpenCashMgmt}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <DollarSign className="h-4 w-4 shrink-0" />
              Cash In / Out
            </button>
            <button
              onClick={onOpenEod}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-amber-400 hover:bg-zinc-800 transition-colors"
            >
              <DollarSign className="h-4 w-4 shrink-0" />
              Close Register
            </button>
          </>
        )}

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        >
          {dark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {dark ? 'Light mode' : 'Dark mode'}
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="h-7 w-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold shrink-0 text-zinc-200">
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{user?.name}</p>
            <p className="text-xs text-zinc-500 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────

export function DashboardLayout() {
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { registerId, sessionId, setSession } = useTerminalStore();
  const navigate = useNavigate();
  const { dark, toggle: toggleTheme } = useTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [eodOpen, setEodOpen] = useState(false);
  const [denomCounts, setDenomCounts] = useState<DenomCounts>({});
  const [cashMgmtOpen, setCashMgmtOpen] = useState(false);
  const [cashMgmtType, setCashMgmtType] = useState<'paid_in' | 'paid_out'>('paid_in');
  const [cashMgmtAmount, setCashMgmtAmount] = useState('');
  const [cashMgmtReason, setCashMgmtReason] = useState('');
  const [cashMgmtError, setCashMgmtError] = useState('');
  const [cashMgmtSuccess, setCashMgmtSuccess] = useState('');
  const [eodNotes, setEodNotes] = useState('');
  const [eodError, setEodError] = useState('');

  const { data: summaryData } = useQuery({
    queryKey: ['register-session-summary', registerId],
    queryFn: () =>
      api.get(`/registers/${registerId}/session-summary`).then((r) => r.data.data),
    enabled: !!registerId && eodOpen,
  });

  const closeMutation = useMutation({
    mutationFn: ({ closingCash, notes }: { closingCash: number; notes?: string }) =>
      api.post(`/registers/${registerId}/close`, { closingCash, notes }),
    onSuccess: () => {
      setSession(null);
      queryClient.invalidateQueries({ queryKey: ['register-session-summary'] });
      setEodOpen(false);
    },
    onError: (err: unknown) => {
      setEodError(err instanceof Error ? err.message : 'Failed to close register');
    },
  });

  function openEod() {
    setDenomCounts({});
    setEodNotes('');
    setEodError('');
    setDrawerOpen(false);
    setEodOpen(true);
  }

  const cashMgmtMutation = useMutation({
    mutationFn: () =>
      api.post(`/cash-drops/sessions/${sessionId}`, {
        type: cashMgmtType,
        amount: Math.abs(parseFloat(cashMgmtAmount)),
        reason: cashMgmtReason.trim() || undefined,
      }),
    onSuccess: () => {
      setCashMgmtSuccess(cashMgmtType === 'paid_in' ? 'Cash received.' : 'Cash disbursed.');
      setCashMgmtAmount('');
      setCashMgmtReason('');
    },
    onError: (err: unknown) => {
      setCashMgmtError(err instanceof Error ? err.message : 'Failed to record transaction');
    },
  });

  function openCashMgmt() {
    setCashMgmtAmount('');
    setCashMgmtReason('');
    setCashMgmtError('');
    setCashMgmtSuccess('');
    setDrawerOpen(false);
    setCashMgmtOpen(true);
  }

  function handleCashMgmt() {
    setCashMgmtError('');
    setCashMgmtSuccess('');
    const amt = parseFloat(cashMgmtAmount);
    if (isNaN(amt) || amt <= 0) return setCashMgmtError('Enter a valid amount');
    cashMgmtMutation.mutate();
  }

  function handleClose() {
    const closingCash = calcCashFromDenoms(denomCounts);
    closeMutation.mutate({ closingCash, notes: eodNotes.trim() || undefined });
  }

  const countedCash = calcCashFromDenoms(denomCounts);
  const expectedCash: number = summaryData?.expectedCash ?? 0;
  const variance = countedCash - expectedCash;

  const userLevel = roleLevel[(user?.role ?? 'cashier') as keyof typeof roleLevel] ?? 0;
  const canSee = (minRole?: 'manager' | 'admin') =>
    !minRole || userLevel >= roleLevel[minRole];

  const visibleGroups = allGroups
    .map((g) => ({ ...g, visibleItems: g.items.filter((i) => canSee(i.minRole)) }))
    .filter((g) => g.visibleItems.length > 0);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const sidebarProps = {
    visibleGroups,
    dark,
    onThemeToggle: toggleTheme,
    user: user ?? null,
    sessionId: sessionId ?? null,
    onOpenCashMgmt: openCashMgmt,
    onOpenEod: openEod,
    onLogout: handleLogout,
  };

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-zinc-800">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* ── Mobile: top bar + drawer ─────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 bg-zinc-950 border-b border-zinc-800 flex items-center px-3 gap-3 z-40">
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-amber-500 flex items-center justify-center">
            <ShoppingBag className="h-3.5 w-3.5 text-zinc-950" />
          </div>
          <span className="font-semibold text-sm text-zinc-100">RetailOS</span>
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="md:hidden fixed top-0 left-0 bottom-0 w-64 z-50 shadow-2xl">
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent {...sidebarProps} onNav={() => setDrawerOpen(false)} />
          </div>
        </>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto md:pt-0 pt-12">
        <Outlet />
      </main>

      {/* ── EOD / Close Register dialog ───────────────────────────────────────── */}
      <Dialog open={eodOpen} onOpenChange={(o) => !closeMutation.isPending && setEodOpen(o)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Close Register — End of Day</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {summaryData && (
              <div className="border rounded-lg overflow-hidden text-sm">
                <div className="bg-muted/50 px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">
                  Session Summary
                </div>
                <div className="divide-y">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Orders</span>
                    <span className="font-medium">{summaryData.orderCount}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Gross Sales</span>
                    <span className="font-medium tabular-nums">{formatCurrency(summaryData.salesTotal)}</span>
                  </div>
                  {Object.entries(summaryData.paymentTotals as Record<string, number>).map(([method, amount]) => (
                    <div key={method} className="flex justify-between px-3 py-2 pl-6">
                      <span className="text-muted-foreground capitalize">{method.replace('_', ' ')}</span>
                      <span className="tabular-nums">{formatCurrency(amount)}</span>
                    </div>
                  ))}
                  {summaryData.cashDropsTotal > 0 && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Cash Drops (removed)</span>
                      <span className="tabular-nums text-destructive">−{formatCurrency(summaryData.cashDropsTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-3 py-2 bg-muted/30 font-medium">
                    <span>Expected Cash in Drawer</span>
                    <span className="tabular-nums">{formatCurrency(summaryData.expectedCash)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium">Count Cash Drawer</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Bills</p>
                  {BILLS.map((d) => (
                    <div key={d.value} className="flex items-center gap-2">
                      <Label className="w-16 text-right text-sm shrink-0">{d.label}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="h-8 w-20 text-right"
                        value={denomCounts[String(d.value)] ?? ''}
                        placeholder="0"
                        onChange={(e) =>
                          setDenomCounts((prev) => ({
                            ...prev,
                            [String(d.value)]: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                      />
                      <span className="text-xs text-muted-foreground tabular-nums w-16">
                        {formatCurrency((denomCounts[String(d.value)] ?? 0) * d.value)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Coins</p>
                  {COINS.map((d) => (
                    <div key={d.value} className="flex items-center gap-2">
                      <Label className="w-28 text-right text-sm shrink-0">{d.label}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="h-8 w-20 text-right"
                        value={denomCounts[String(d.value)] ?? ''}
                        placeholder="0"
                        onChange={(e) =>
                          setDenomCounts((prev) => ({
                            ...prev,
                            [String(d.value)]: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                      />
                      <span className="text-xs text-muted-foreground tabular-nums w-16">
                        {formatCurrency((denomCounts[String(d.value)] ?? 0) * d.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden text-sm">
              <div className="divide-y">
                <div className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Counted Cash</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(countedCash)}</span>
                </div>
                <div className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Expected Cash</span>
                  <span className="tabular-nums">{formatCurrency(expectedCash)}</span>
                </div>
                <div className={cn(
                  'flex justify-between px-3 py-2 font-semibold',
                  variance === 0 ? 'text-foreground' : variance > 0 ? 'text-green-600' : 'text-destructive',
                )}>
                  <span>Variance</span>
                  <span className="tabular-nums">
                    {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eod-notes">Notes (optional)</Label>
              <Input
                id="eod-notes"
                value={eodNotes}
                onChange={(e) => setEodNotes(e.target.value)}
                placeholder="e.g. Short $5 — unresolved"
              />
            </div>

            {eodError && <p className="text-sm text-destructive">{eodError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEodOpen(false)} disabled={closeMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={closeMutation.isPending}
            >
              {closeMutation.isPending ? 'Closing…' : 'Close Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cash Management (Paid In / Out) dialog ────────────────────────────── */}
      <Dialog open={cashMgmtOpen} onOpenChange={(o) => !cashMgmtMutation.isPending && setCashMgmtOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cash In / Out</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={cashMgmtType === 'paid_in' ? 'default' : 'outline'}
                onClick={() => setCashMgmtType('paid_in')}
              >
                + Paid In
              </Button>
              <Button
                variant={cashMgmtType === 'paid_out' ? 'default' : 'outline'}
                onClick={() => setCashMgmtType('paid_out')}
              >
                − Paid Out
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cm-amount">Amount</Label>
              <Input
                id="cm-amount"
                type="number"
                min={0.01}
                step={0.01}
                placeholder="0.00"
                value={cashMgmtAmount}
                onChange={(e) => setCashMgmtAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cm-reason">Reason</Label>
              <Input
                id="cm-reason"
                placeholder={cashMgmtType === 'paid_in' ? 'e.g. Change from bank…' : 'e.g. Delivery driver…'}
                value={cashMgmtReason}
                onChange={(e) => setCashMgmtReason(e.target.value)}
              />
            </div>
            {cashMgmtError && <p className="text-sm text-destructive">{cashMgmtError}</p>}
            {cashMgmtSuccess && <p className="text-sm text-green-600">{cashMgmtSuccess}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashMgmtOpen(false)} disabled={cashMgmtMutation.isPending}>
              Close
            </Button>
            <Button onClick={handleCashMgmt} disabled={cashMgmtMutation.isPending}>
              {cashMgmtMutation.isPending ? 'Recording…' : 'Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
