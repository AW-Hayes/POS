import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Package, ClipboardList, Users, AlertTriangle, ShoppingCart } from 'lucide-react';

interface BelowReorderItem {
  id: string;
  productId: string;
  quantity: number;
  reorderPoint: number;
  reorderQty: number | null;
  product: { id: string; name: string; sku?: string; cost?: number; preferredVendor?: { id: string; name: string } | null };
  variant?: { id: string; sku?: string } | null;
}

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

  const { data: belowReorder } = useQuery({
    queryKey: ['inventory', 'below-reorder'],
    queryFn: () => api.get('/inventory/below-reorder').then((r) => r.data.data as BelowReorderItem[]),
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
    {
      label: 'Reorder Required',
      value: belowReorder?.length ?? '—',
      sub: 'items below reorder point',
      icon: ShoppingCart,
      color: belowReorder?.length ? 'text-orange-600' : 'text-gray-400',
      bg: belowReorder?.length ? 'bg-orange-50' : 'bg-gray-50',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p className="text-muted-foreground">Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

      {belowReorder && belowReorder.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-orange-600" />
              Reorder Required
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium">Vendor</th>
                  <th className="text-right p-3 font-medium">On Hand</th>
                  <th className="text-right p-3 font-medium">Reorder Pt</th>
                  <th className="text-right p-3 font-medium">Suggest Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {belowReorder.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <p className="font-medium">{item.product.name}</p>
                      {item.product.sku && (
                        <p className="text-xs text-muted-foreground">{item.product.sku}</p>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {item.product.preferredVendor?.name ?? '—'}
                    </td>
                    <td className="p-3 text-right font-semibold text-destructive tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {item.reorderPoint}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {item.reorderQty ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
