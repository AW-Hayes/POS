import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Order, OrderStatus } from '@pos/types';

const STATUS_VARIANTS: Record<OrderStatus, 'success' | 'secondary' | 'destructive' | 'warning'> = {
  completed: 'success',
  open: 'warning',
  voided: 'destructive',
  refunded: 'secondary',
  held: 'secondary',
  estimate: 'secondary',
  layaway: 'warning',
};

const STATUSES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' },
];

export function OrdersPage() {
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', status],
    queryFn: () =>
      api.get('/orders', { params: { status: status || undefined, pageSize: 100 } }).then((r) => r.data),
  });

  const orders: Order[] = data?.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>

      <div className="flex gap-2">
        {STATUSES.map(({ value, label }) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? 'default' : 'outline'}
            onClick={() => setStatus(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Order ID</th>
                <th className="text-left p-3 font-medium">Customer</th>
                <th className="text-left p-3 font-medium">Items</th>
                <th className="text-right p-3 font-medium">Total</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono text-xs text-muted-foreground">
                    {order.id.slice(-8).toUpperCase()}
                  </td>
                  <td className="p-3">{order.customer?.name ?? <span className="text-muted-foreground">Walk-in</span>}</td>
                  <td className="p-3 text-muted-foreground">{order.items.length} item(s)</td>
                  <td className="p-3 text-right font-semibold">{formatCurrency(order.total)}</td>
                  <td className="p-3 text-center">
                    <Badge variant={STATUS_VARIANTS[order.status]}>{order.status}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No orders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
