import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Ban } from 'lucide-react';
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
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [voidTarget, setVoidTarget] = useState<Order | null>(null);
  const [voidNote, setVoidNote] = useState('');
  const [voidError, setVoidError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', status],
    queryFn: () =>
      api.get('/orders', { params: { status: status || undefined, pageSize: 100 } }).then((r) => r.data),
  });

  const orders: Order[] = data?.data ?? [];

  const voidMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api.post(`/orders/${id}/void`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setVoidTarget(null);
    },
    onError: (err: unknown) => {
      setVoidError(err instanceof Error ? err.message : 'Void failed');
    },
  });

  function openVoid(order: Order) {
    setVoidTarget(order);
    setVoidNote('');
    setVoidError('');
  }

  function handleVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!voidTarget) return;
    voidMutation.mutate({ id: voidTarget.id, note: voidNote.trim() || undefined });
  }

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
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono text-xs text-muted-foreground">
                    #{order.id.slice(-8).toUpperCase()}
                  </td>
                  <td className="p-3">
                    {order.customer?.name ?? <span className="text-muted-foreground">Walk-in</span>}
                  </td>
                  <td className="p-3 text-muted-foreground">{order.items.length} item(s)</td>
                  <td className="p-3 text-right font-semibold tabular-nums">
                    {formatCurrency(order.total)}
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant={STATUS_VARIANTS[order.status]} className="capitalize">
                      {order.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{formatDate(order.createdAt)}</td>
                  <td className="p-3">
                    {(order.status === 'open' || order.status === 'completed') && (
                      <div className="flex justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Void order"
                          onClick={() => openVoid(order)}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No orders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Order</DialogTitle>
          </DialogHeader>
          {voidTarget && (
            <p className="text-sm text-muted-foreground mb-4">
              You are about to void order{' '}
              <span className="font-mono font-semibold text-foreground">
                #{voidTarget.id.slice(-8).toUpperCase()}
              </span>{' '}
              ({formatCurrency(voidTarget.total)}). This will restore inventory for tracked items.
            </p>
          )}
          <form onSubmit={handleVoid} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="void-note">Reason (optional)</Label>
              <Input
                id="void-note"
                value={voidNote}
                onChange={(e) => setVoidNote(e.target.value)}
                placeholder="e.g. Customer changed mind"
                autoFocus
              />
            </div>

            {voidError && <p className="text-sm text-destructive">{voidError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={voidMutation.isPending}>
                {voidMutation.isPending ? 'Voiding…' : 'Void Order'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
