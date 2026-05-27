import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useTerminalStore } from '@/stores/terminal';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
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
  DollarSign,
} from 'lucide-react';

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  minRole?: 'manager' | 'admin';
};

type NavGroup = {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
};

const allGroups: NavGroup[] = [
  {
    label: 'Sales',
    icon: ClipboardList,
    items: [
      { to: '/orders',    label: 'Orders',    icon: ClipboardList },
      { to: '/estimates', label: 'Estimates', icon: FileText },
      { to: '/layaway',   label: 'Layaway',   icon: Archive },
    ],
  },
  {
    label: 'Catalog',
    icon: Package,
    items: [
      { to: '/products',     label: 'Products',     icon: Package,    minRole: 'manager' },
      { to: '/inventory',    label: 'Inventory',    icon: Warehouse,  minRole: 'manager' },
      { to: '/promotions',   label: 'Promotions',   icon: Tag,        minRole: 'manager' },
      { to: '/price-levels', label: 'Price Levels', icon: Layers,     minRole: 'manager' },
      { to: '/gift-cards',   label: 'Gift Cards',   icon: CreditCard, minRole: 'manager' },
    ],
  },
  {
    label: 'Customers',
    icon: Users,
    items: [
      { to: '/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Procurement',
    icon: Truck,
    items: [
      { to: '/vendors',         label: 'Vendors',         icon: Building2, minRole: 'manager' },
      { to: '/purchase-orders', label: 'Purchase Orders', icon: Truck,     minRole: 'manager' },
    ],
  },
  {
    label: 'Team',
    icon: Clock,
    items: [
      { to: '/time-clock', label: 'Time Clock', icon: Clock },
      { to: '/reports',    label: 'Reports',    icon: BarChart3, minRole: 'manager' },
    ],
  },
];

const roleLevel = { cashier: 0, manager: 1, admin: 2 } as const;

const dropdownContent =
  'z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md ' +
  'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
  'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ' +
  'data-[side=bottom]:slide-in-from-top-2';

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

export function DashboardLayout() {
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { registerId, sessionId, setSession } = useTerminalStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [eodOpen, setEodOpen] = useState(false);
  const [denomCounts, setDenomCounts] = useState<DenomCounts>({});
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
    setEodOpen(true);
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

  const navLink = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    );

  const triggerBase = (active: boolean) =>
    cn(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
      active
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    );

  const dropdownItem =
    'flex items-center gap-2 px-3 py-2 rounded-sm text-sm cursor-pointer outline-none select-none ' +
    'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground';

  return (
    <div className="flex flex-col h-screen">
      {/* ── Top navigation bar ────────────────────────────────────────────────── */}
      <header className="h-14 border-b bg-background flex items-center px-4 gap-1 shrink-0 z-40">

        {/* Logo */}
        <div className="flex items-center gap-2 mr-3 shrink-0">
          <ShoppingBag className="h-5 w-5 text-primary" />
          <span className="font-semibold text-base">POS</span>
        </div>

        {/* Dashboard & Terminal — always visible */}
        <NavLink to="/" end className={navLink}>
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </NavLink>

        <NavLink to="/terminal" className={navLink}>
          <ShoppingCart className="h-4 w-4" />
          Terminal
        </NavLink>

        <div className="w-px h-5 bg-border mx-1 shrink-0" />

        {/* Dynamic groups */}
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isGroupActive = group.visibleItems.some((item) =>
            item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to),
          );

          // Single visible item → render as a direct link (no dropdown)
          if (group.visibleItems.length === 1) {
            const item = group.visibleItems[0];
            const ItemIcon = item.icon;
            return (
              <NavLink key={group.label} to={item.to} end={item.end} className={navLink}>
                <ItemIcon className="h-4 w-4" />
                {group.label}
              </NavLink>
            );
          }

          // Multiple items → dropdown
          return (
            <DropdownMenuPrimitive.Root key={group.label}>
              <DropdownMenuPrimitive.Trigger className={triggerBase(isGroupActive)}>
                <GroupIcon className="h-4 w-4" />
                {group.label}
                <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
              </DropdownMenuPrimitive.Trigger>
              <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.Content
                  align="start"
                  sideOffset={6}
                  className={dropdownContent}
                >
                  {group.visibleItems.map((item) => {
                    const ItemIcon = item.icon;
                    const isItemActive = item.end
                      ? location.pathname === item.to
                      : location.pathname.startsWith(item.to);
                    return (
                      <DropdownMenuPrimitive.Item
                        key={item.to}
                        className={cn(
                          dropdownItem,
                          isItemActive && 'bg-primary text-primary-foreground',
                        )}
                        onSelect={() => navigate(item.to)}
                      >
                        <ItemIcon className="h-4 w-4" />
                        {item.label}
                      </DropdownMenuPrimitive.Item>
                    );
                  })}
                </DropdownMenuPrimitive.Content>
              </DropdownMenuPrimitive.Portal>
            </DropdownMenuPrimitive.Root>
          );
        })}

        {/* Push remaining items to the right */}
        <div className="flex-1" />

        {/* Close Register — only when a session is active */}
        {sessionId && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-muted-foreground border-dashed"
            onClick={openEod}
          >
            <DollarSign className="h-3.5 w-3.5" />
            Close Register
          </Button>
        )}

        {/* Settings */}
        <NavLink to="/settings" className={navLink}>
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>

        {/* User menu */}
        <DropdownMenuPrimitive.Root>
          <DropdownMenuPrimitive.Trigger
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors',
              'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
              {user?.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <span className="hidden md:inline max-w-[120px] truncate">{user?.name}</span>
            <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
          </DropdownMenuPrimitive.Trigger>
          <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
              align="end"
              sideOffset={6}
              className={dropdownContent}
            >
              <div className="px-3 py-2 border-b mb-1">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <DropdownMenuPrimitive.Item
                className={cn(dropdownItem, 'text-destructive')}
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenuPrimitive.Item>
            </DropdownMenuPrimitive.Content>
          </DropdownMenuPrimitive.Portal>
        </DropdownMenuPrimitive.Root>
      </header>

      {/* ── Page content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* ── EOD / Close Register dialog ───────────────────────────────────────── */}
      <Dialog open={eodOpen} onOpenChange={(o) => !closeMutation.isPending && setEodOpen(o)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Close Register — End of Day</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Sales summary */}
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

            {/* Denomination count */}
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

            {/* Variance summary */}
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

            {/* Notes */}
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
    </div>
  );
}
