import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Ban, RotateCcw, Receipt, Printer, Mail, Check } from 'lucide-react';
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
  { value: 'refunded', label: 'Refunded' },
];

const RETURN_REASONS = [
  'Customer changed mind',
  'Defective / damaged',
  'Wrong item ordered',
  'Wrong item received',
  'Duplicate purchase',
  'Other',
];

type ReturnLine = { orderItemId: string; name: string; maxQty: number; returnQty: number; unitPrice: number };

export function OrdersPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  // Void dialog
  const [voidTarget, setVoidTarget] = useState<Order | null>(null);
  const [voidNote, setVoidNote] = useState('');
  const [voidError, setVoidError] = useState('');

  // Return dialog
  const [returnTarget, setReturnTarget] = useState<Order | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [returnMethod, setReturnMethod] = useState<'cash' | 'card' | 'store_credit'>('cash');
  const [restockItems, setRestockItems] = useState(true);
  const [returnError, setReturnError] = useState('');
  const [storeCreditCode, setStoreCreditCode] = useState('');

  // Receipt dialog
  const [receiptTarget, setReceiptTarget] = useState<Order | null>(null);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [receiptSent, setReceiptSent] = useState(false);

  const receiptEmailMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      api.post(`/receipts/orders/${id}/email`, { email: email || undefined }),
    onSuccess: () => setReceiptSent(true),
  });

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

  const returnMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) =>
      api.post(`/orders/${id}/return`, payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (res.data.storeCreditCode) {
        setStoreCreditCode(res.data.storeCreditCode);
      } else {
        setReturnTarget(null);
      }
    },
    onError: (err: unknown) => {
      setReturnError(err instanceof Error ? err.message : 'Return failed');
    },
  });

  function openVoid(order: Order) {
    setVoidTarget(order);
    setVoidNote('');
    setVoidError('');
  }

  function openReturn(order: Order) {
    setReturnTarget(order);
    setReturnLines(
      order.items.map((item) => ({
        orderItemId: item.id,
        name: item.name,
        maxQty: item.quantity,
        returnQty: item.quantity,
        unitPrice: item.price - item.discount,
      })),
    );
    setReturnReason('');
    setReturnMethod('cash');
    setRestockItems(true);
    setReturnError('');
    setStoreCreditCode('');
  }

  function handleVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!voidTarget) return;
    voidMutation.mutate({ id: voidTarget.id, note: voidNote.trim() || undefined });
  }

  function handleReturn() {
    if (!returnTarget) return;
    const itemsToReturn = returnLines.filter((l) => l.returnQty > 0);
    if (itemsToReturn.length === 0) return setReturnError('Select at least one item to return');
    setReturnError('');
    returnMutation.mutate({
      id: returnTarget.id,
      payload: {
        items: itemsToReturn.map((l) => ({ orderItemId: l.orderItemId, quantity: l.returnQty })),
        reason: returnReason || undefined,
        refundMethod: returnMethod,
        restockItems,
      },
    });
  }

  const returnTotal = returnLines.reduce((s, l) => s + l.unitPrice * l.returnQty, 0);

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
                    <div className="flex justify-end gap-1">
                      {order.status === 'completed' && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Receipt"
                            onClick={() => {
                              setReceiptTarget(order);
                              setReceiptEmail((order.customer as { email?: string } | undefined)?.email ?? '');
                              setReceiptSent(false);
                            }}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Return / Refund"
                            onClick={() => openReturn(order)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {(order.status === 'open' || order.status === 'completed') && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Void order"
                          onClick={() => openVoid(order)}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
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

      {/* Void dialog */}
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

      {/* Store credit confirmation */}
      <Dialog open={!!storeCreditCode} onOpenChange={(o) => { if (!o) { setStoreCreditCode(''); setReturnTarget(null); } }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Return Complete</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Store credit issued. Give the customer this gift card code:</p>
            <p className="text-2xl font-mono font-bold tracking-widest border rounded-lg py-3 px-4 bg-muted">
              {storeCreditCode}
            </p>
            <p className="text-xs text-muted-foreground">
              The customer can use this code at checkout as a gift card payment.
            </p>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => { setStoreCreditCode(''); setReturnTarget(null); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!receiptTarget} onOpenChange={(o) => { if (!o) { setReceiptTarget(null); setReceiptSent(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Receipt — #{receiptTarget?.id.slice(-8).toUpperCase()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => receiptTarget && window.open(`/api/receipts/orders/${receiptTarget.id}/print`, '_blank')}
            >
              <Printer className="h-4 w-4" />
              Print Receipt
            </Button>

            <div className="space-y-2">
              <p className="text-sm font-medium">Email Receipt</p>
              {receiptSent ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  Sent to {receiptEmailMutation.variables?.email || 'customer'}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="email"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="customer@example.com"
                    value={receiptEmail}
                    onChange={(e) => setReceiptEmail(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={receiptEmailMutation.isPending || !receiptEmail}
                    onClick={() => receiptTarget && receiptEmailMutation.mutate({ id: receiptTarget.id, email: receiptEmail })}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {receiptEmailMutation.isPending ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              )}
              {receiptEmailMutation.isError && (
                <p className="text-xs text-destructive">
                  {receiptEmailMutation.error instanceof Error ? receiptEmailMutation.error.message : 'Failed to send'}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => { setReceiptTarget(null); setReceiptSent(false); }}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <Dialog open={!!returnTarget && !storeCreditCode} onOpenChange={(o) => !o && setReturnTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Return — #{returnTarget?.id.slice(-8).toUpperCase()}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Line items */}
            <div className="border rounded-lg overflow-hidden text-sm">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Item</th>
                    <th className="text-right p-2 font-medium">Unit Price</th>
                    <th className="text-right p-2 font-medium">Orig. Qty</th>
                    <th className="text-right p-2 font-medium">Return Qty</th>
                    <th className="text-right p-2 font-medium">Refund</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {returnLines.map((line, i) => (
                    <tr key={line.orderItemId}>
                      <td className="p-2 font-medium">{line.name}</td>
                      <td className="p-2 text-right tabular-nums">{formatCurrency(line.unitPrice)}</td>
                      <td className="p-2 text-right">{line.maxQty}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={line.maxQty}
                          className="w-16 border rounded p-1 text-right text-sm bg-background"
                          value={line.returnQty}
                          onChange={(e) =>
                            setReturnLines((prev) =>
                              prev.map((l, idx) =>
                                idx === i
                                  ? { ...l, returnQty: Math.min(line.maxQty, Math.max(0, Number(e.target.value))) }
                                  : l,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {formatCurrency(line.unitPrice * line.returnQty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td colSpan={4} className="p-2 text-right font-medium">Total Refund</td>
                    <td className="p-2 text-right font-bold tabular-nums">{formatCurrency(returnTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select value={returnReason || '__none__'} onValueChange={(v) => setReturnReason(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No reason</SelectItem>
                    {RETURN_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Refund Method</Label>
                <Select value={returnMethod} onValueChange={(v: typeof returnMethod) => setReturnMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card (credit to card)</SelectItem>
                    <SelectItem value="store_credit">Store Credit (gift card)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={restockItems}
                onChange={(e) => setRestockItems(e.target.checked)}
                className="rounded"
              />
              Restock items into inventory
            </label>

            {returnError && <p className="text-sm text-destructive">{returnError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnTarget(null)}>Cancel</Button>
            <Button
              onClick={handleReturn}
              disabled={returnMutation.isPending || returnTotal === 0}
            >
              {returnMutation.isPending ? 'Processing…' : `Issue Refund ${returnTotal > 0 ? formatCurrency(returnTotal) : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
