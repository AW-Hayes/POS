import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Package, ClipboardList, Users, AlertTriangle } from 'lucide-react';

export function DashboardHome() {
  const user = useAuthStore((s) => s.user);

  const { data: products } = useQuery({
    queryKey: ['products', 'count'],
    queryFn: () => api.get('/products?pageSize=1').then((r) => r.data.total as number),
  });

  const { data: orders } = useQuery({
    queryKey: ['orders', 'today'],
    queryFn: () =>
      api.get('/orders?status=completed&pageSize=100').then((r) => {
        const items = r.data.data as Array<{ total: number; createdAt: string }>;
        const today = new Date().toDateString();
        const todayOrders = items.filter((o) => new Date(o.createdAt).toDateString() === today);
        return {
          count: todayOrders.length,
          revenue: todayOrders.reduce((s, o) => s + o.total, 0),
        };
      }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 'count'],
    queryFn: () => api.get('/customers?pageSize=1').then((r) => r.data.total as number),
  });

  const { data: lowStock } = useQuery({
    queryKey: ['inventory', 'low-stock'],
    queryFn: () => api.get('/inventory?lowStock=true&pageSize=1').then((r) => r.data.total as number),
  });

  const stats = [
    {
      label: "Today's Revenue",
      value: formatCurrency(orders?.revenue ?? 0),
      sub: `${orders?.count ?? 0} orders`,
      icon: ClipboardList,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Products',
      value: products ?? '—',
      sub: 'active items',
      icon: Package,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Customers',
      value: customers ?? '—',
      sub: 'total',
      icon: Users,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Low Stock',
      value: lowStock ?? '—',
      sub: 'items below threshold',
      icon: AlertTriangle,
      color: lowStock ? 'text-red-600' : 'text-gray-400',
      bg: lowStock ? 'bg-red-50' : 'bg-gray-50',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p className="text-muted-foreground">Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <div className={`rounded-full p-2 ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
