import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { ShoppingBag, PlusCircle, CheckCircle, XCircle } from 'lucide-react';
import type { Order, LayawayDeposit } from '@pos/types';

type LayawayOrder = Order & { layawayDeposits: LayawayDeposit[] };

export function LayawayPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<LayawayOrder | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState('cash');

  const { data: orders = [], isLoading } = useQuery<LayawayOrder[]>({
    queryKey: ['layaway'],
    queryFn: () => api.get('/layaway').then((r) => r.data.data),
  });

  const depositMutation = useMutation({
    mutationFn: ({ orderId, amount, method }: { orderId: string; amount: number; method: string }) =>
      api.post(`/layaway/${orderId}/deposits`, { amount, method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layaway'] });
      setDepositAmount('');
    },
  });

  const completeMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/layaway/${orderId}/complete`, { finalPaymentMethod: depositMethod }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layaway'] });
      setSelected(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => api.post(`/layaway/${orderId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layaway'] });
      setSelected(null);
    },
  });

  function paidAmount(order: LayawayOrder) {
    return order.layawayDeposits.reduce((s, d) => s + d.amount, 0);
  }

  function remainingAmount(order: LayawayOrder) {
    return Math.max(0, order.total - paidAmount(order));
  }

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Layaway</h1>
          <p className="text-sm text-muted-foreground mt-1">Items held for customers with partial payments</p>
        </div>
        <Badge variant="secondary">{orders.length} active</Badge>
      </div>

      {orders.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No layaway orders. Convert an order to layaway from the terminal.</p>
        </div>
      )}

      <div className="rounded-md border overflow-hidden">
        {orders.map((order, i) => {
          const paid = paidAmount(order);
          const remaining = remainingAmount(order);
          const pct = Math.min(100, Math.round((paid / order.total) * 100));
          return (
            <div
              key={order.id}
              className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors ${i > 0 ? 'border-t' : ''}`}
              onClick={() => setSelected(order)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium">{order.customer?.name ?? 'Walk-in'}</p>
                <p className="text-sm text-muted-foreground">
                  {order.items.length} item(s) · {new Date(order.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="w-32 hidden sm:block">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{pct}% paid</span>
                  <span>{formatCurrency(remaining)} left</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <span className="font-semibold tabular-nums">{formatCurrency(order.total)}</span>
            </div>
          );
        })}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Layaway — {selected?.customer?.name ?? 'Walk-in'}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {/* Items */}
              <div className="rounded-md border divide-y text-sm">
                {selected.items.map((item) => (
                  <div key={item.id} className="flex justify-between px-3 py-2">
                    <span>{item.quantity}× {item.name}</span>
                    <span className="font-medium">{formatCurrency(item.total)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(selected.total)}</span>
                </div>
              </div>

              {/* Payment progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paid so far</span>
                  <span className="font-medium text-green-600">{formatCurrency(paidAmount(selected))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remaining balance</span>
                  <span className="font-semibold">{formatCurrency(remainingAmount(selected))}</span>
                </div>
                {selected.layawayDeposits.length > 0 && (
                  <div className="rounded-md bg-muted/30 p-2 space-y-1 text-xs">
                    {selected.layawayDeposits.map((d) => (
                      <div key={d.id} className="flex justify-between">
                        <span className="text-muted-foreground capitalize">{d.method} · {new Date(d.createdAt).toLocaleDateString()}</span>
                        <span>{formatCurrency(d.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add deposit */}
              {remainingAmount(selected) > 0 && (
                <div className="border rounded-md p-3 space-y-2">
                  <p className="text-sm font-medium">Add payment</p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0.01}
                      step={0.01}
                      max={remainingAmount(selected)}
                      placeholder="Amount"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="flex-1"
                    />
                    <Select value={depositMethod} onValueChange={setDepositMethod}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="store_credit">Store Credit</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!depositAmount || parseFloat(depositAmount) <= 0 || depositMutation.isPending}
                      onClick={() => depositMutation.mutate({ orderId: selected.id, amount: parseFloat(depositAmount), method: depositMethod })}
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => cancelMutation.mutate(selected!.id)}
              disabled={cancelMutation.isPending}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Cancel Layaway
            </Button>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            {selected && remainingAmount(selected) <= 0.01 && (
              <Button
                onClick={() => completeMutation.mutate(selected.id)}
                disabled={completeMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Complete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
