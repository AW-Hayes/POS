import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, ClipboardList,
  Users, Settings, LogOut, ShoppingBag, BarChart3, Building2,
  Truck, Tag, Layers, CreditCard, FileText, Archive, Clock, ChevronDown,
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

export function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

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
                    return (
                      <DropdownMenuPrimitive.Item key={item.to} asChild>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) =>
                            cn(
                              dropdownItem,
                              isActive && 'bg-primary text-primary-foreground data-[highlighted]:bg-primary',
                            )
                          }
                        >
                          <ItemIcon className="h-4 w-4" />
                          {item.label}
                        </NavLink>
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
    </div>
  );
}
