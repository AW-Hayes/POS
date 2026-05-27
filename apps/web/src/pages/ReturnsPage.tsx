import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Search, RotateCcw, Plus, Minus } from 'lucide-react';

interface OrderItem {
  id: string;
  name: string;
  sku?: string;
  price: number;
  quantity: number;
  discount: number;
  total: number;
  taxRate: number;
}

interface Order {
  id: string;
  createdAt: string;
  total: number;
  subtotal: number;
  status: string;
  customer?: { name: string };
  items: OrderItem[];
}

interface ReturnRecord {
  id: string;
  orderId: string;
  reason?: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  createdAt: string;
  items: Array<{ id: string; orderItemId: string; quantity: number; price: number; total: number }>;
  refunds: Array<{ id: string; method: string; amount: number }>;
}

const REFUND_METHODS = ['cash', 'card', 'store_credit', 'gift_card'] as const;

export function ReturnsPage() {
  const qc = useQueryClient();
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<string>('cash');
  const [error, setError] = useState('');

  const { data: orderResults, isFetching: searching } = useQuery({
    queryKey: ['orders', 'search', orderSearch],
    queryFn: () =>
      api.get('/orders', { params: { q: orderSearch, status: 'completed', pageSize: 10 } }).then((r) => r.data.data as Order[]),
    enabled: orderSearch.length >= 3,
  });

  const { data: returns = [], isLoading } = useQuery<ReturnRecord[]>({
    queryKey: ['returns'],
    queryFn: () => api.get('/returns').then((r) => r.data.data),
  });

  const returnMutation = useMutation({
    mutationFn: (payload: object) => api.post('/returns', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setSelectedOrder(null);
      setReturnQtys({});
      setReason('');
      setError('');
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Return failed'),
  });

  function selectOrder(order: Order) {
    setSelectedOrder(order);
    const initial: Record<string, number> = {};
    order.items.forEach((i) => { initial[i.id] = 0; });
    setReturnQtys(initial);
    setError('');
  }

  const returnTotal = selectedOrder
    ? selectedOrder.items.reduce((s, item) => {
        const qty = returnQtys[item.id] ?? 0;
        const unitNet = item.price - item.discount;
        return s + unitNet * qty * (1 + item.taxRate);
      }, 0)
    : 0;

  function submitReturn() {
    if (!selectedOrder) return;
    const items = selectedOrder.items
      .filter((i) => (returnQtys[i.id] ?? 0) > 0)
      .map((i) => ({ orderItemId: i.id, quantity: returnQtys[i.id] }));
    if (!items.length) return setError('Select at least one item to return');

    returnMutation.mutate({
      orderId: selectedOrder.id,
      reason: reason || undefined,
      items,
      refunds: [{ method: refundMethod, amount: Math.round(returnTotal * 100) / 100 }],
    });
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Returns</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: search + initiate return */}
        <div className="space-y-4">
          <h2 className="font-semibold">Process a Return</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by order ID, customer…"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
          </div>

          {orderSearch.length >= 3 && (
            <div className="border rounded-lg divide-y max-h-56 overflow-y-auto text-sm">
              {searching && <p className="p-3 text-muted-foreground">Searching…</p>}
              {!searching && (orderResults ?? []).length === 0 && (
                <p className="p-3 text-muted-foreground">No completed orders found</p>
              )}
              {(orderResults ?? []).map((order) => (
                <button
                  key={order.id}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                  onClick={() => { selectOrder(order); setOrderSearch(''); }}
                >
                  <div className="flex justify-between">
                    <span className="font-medium">{order.customer?.name ?? 'Walk-in'}</span>
                    <span>{formatCurrency(order.total)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{order.id.slice(-8).toUpperCase()} · {formatDate(order.createdAt)}</p>
                </button>
              ))}
            </div>
          )}

          {selectedOrder && (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{selectedOrder.customer?.name ?? 'Walk-in'}</p>
                  <p className="text-xs text-muted-foreground">{selectedOrder.id.slice(-8).toUpperCase()} · {formatDate(selectedOrder.createdAt)}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedOrder(null)}>Clear</Button>
              </div>

              <div className="space-y-3">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(item.price)} × {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        disabled={(returnQtys[item.id] ?? 0) <= 0}
                        onClick={() => setReturnQtys((p) => ({ ...p, [item.id]: Math.max(0, (p[item.id] ?? 0) - 1) }))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm tabular-nums">{returnQtys[item.id] ?? 0}</span>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        disabled={(returnQtys[item.id] ?? 0) >= item.quantity}
                        onClick={() => setReturnQtys((p) => ({ ...p, [item.id]: Math.min(item.quantity, (p[item.id] ?? 0) + 1) }))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. defective, wrong item…" />
              </div>

              <div className="space-y-2">
                <Label>Refund method</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REFUND_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-semibold">Refund Total</span>
                <span className="font-bold text-lg">{formatCurrency(returnTotal)}</span>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                className="w-full"
                onClick={submitReturn}
                disabled={returnMutation.isPending || returnTotal <= 0}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {returnMutation.isPending ? 'Processing…' : 'Process Return'}
              </Button>
            </div>
          )}
        </div>

        {/* Right: recent returns */}
        <div className="space-y-4">
          <h2 className="font-semibold">Recent Returns</h2>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : returns.length === 0 ? (
            <p className="text-muted-foreground text-sm">No returns yet.</p>
          ) : (
            <div className="space-y-3">
              {returns.slice(0, 20).map((r) => (
                <div key={r.id} className="border rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium">Order #{r.orderId.slice(-8).toUpperCase()}</span>
                    <span className="font-semibold">{formatCurrency(r.total)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}{r.reason ? ` · ${r.reason}` : ''}</p>
                  <div className="flex gap-2 flex-wrap">
                    {r.refunds.map((rf) => (
                      <Badge key={rf.id} variant="outline" className="text-xs">{rf.method.replace('_', ' ')} {formatCurrency(rf.amount)}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
