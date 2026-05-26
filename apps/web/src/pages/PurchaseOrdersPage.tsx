import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';
import { ShoppingCart, Plus } from 'lucide-react';
import type { PurchaseOrder, PurchaseOrderStatus } from '@pos/types';

const STATUS_VARIANTS: Record<PurchaseOrderStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  draft: 'secondary',
  ordered: 'warning',
  partial: 'warning',
  received: 'success',
  cancelled: 'destructive',
};

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'partial', label: 'Partial' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function PurchaseOrdersPage() {
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', status],
    queryFn: () =>
      api.get('/purchase-orders', { params: { status: status || undefined } }).then((r) => r.data),
  });

  const pos: PurchaseOrder[] = data?.data ?? [];

  const submitMutation = useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/submit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });

  const receiveMutation = useMutation({
    mutationFn: ({ id, items }: { id: string; items: Array<{ purchaseOrderItemId: string; receivedQty: number }> }) =>
      api.post(`/purchase-orders/${id}/receive`, { items }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setReceiving(null);
      setReceiveQtys({});
    },
  });

  function openReceive(po: PurchaseOrder) {
    const qtys: Record<string, number> = {};
    for (const item of po.items) {
      qtys[item.id] = item.orderedQty - item.receivedQty;
    }
    setReceiveQtys(qtys);
    setReceiving(po);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
      </div>

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
                <th className="text-left p-3 font-medium">PO #</th>
                <th className="text-left p-3 font-medium">Vendor</th>
                <th className="text-left p-3 font-medium">Items</th>
                <th className="text-right p-3 font-medium">Total</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {pos.map((po) => (
                <tr key={po.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-xs">{po.id.slice(-8).toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="p-3">{po.vendor?.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3 text-muted-foreground">{po.items.length} item(s)</td>
                  <td className="p-3 text-right font-semibold">{formatCurrency(po.total)}</td>
                  <td className="p-3 text-center">
                    <Badge variant={STATUS_VARIANTS[po.status]}>{po.status}</Badge>
                  </td>
                  <td className="p-3 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(po)}>Details</Button>
                    {po.status === 'draft' && (
                      <Button size="sm" variant="ghost" onClick={() => submitMutation.mutate(po.id)}>Submit</Button>
                    )}
                    {['ordered', 'partial'].includes(po.status) && (
                      <Button size="sm" variant="ghost" onClick={() => openReceive(po)}>Receive</Button>
                    )}
                    {['draft', 'ordered'].includes(po.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => { if (confirm('Cancel this purchase order?')) cancelMutation.mutate(po.id); }}
                      >
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {pos.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No purchase orders</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o: boolean) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Purchase Order Details</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Vendor:</span> {detail.vendor?.name ?? '—'}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={STATUS_VARIANTS[detail.status]}>{detail.status}</Badge></div>
                <div><span className="text-muted-foreground">Notes:</span> {detail.notes ?? '—'}</div>
              </div>
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Product</th>
                    <th className="text-right p-2 font-medium">Ordered</th>
                    <th className="text-right p-2 font-medium">Received</th>
                    <th className="text-right p-2 font-medium">Unit Cost</th>
                    <th className="text-right p-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {detail.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-2">{item.product?.name ?? item.productId}</td>
                      <td className="p-2 text-right">{item.orderedQty}</td>
                      <td className="p-2 text-right">{item.receivedQty}</td>
                      <td className="p-2 text-right">{formatCurrency(item.unitCost)}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive dialog */}
      <Dialog open={!!receiving} onOpenChange={(o: boolean) => !o && setReceiving(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Receive Items</DialogTitle></DialogHeader>
          {receiving && (
            <div className="space-y-3">
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Product</th>
                    <th className="text-right p-2 font-medium">Ordered</th>
                    <th className="text-right p-2 font-medium">Already Received</th>
                    <th className="text-right p-2 font-medium">Receiving Now</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {receiving.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-2">{item.product?.name ?? item.productId}</td>
                      <td className="p-2 text-right">{item.orderedQty}</td>
                      <td className="p-2 text-right">{item.receivedQty}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={item.orderedQty - item.receivedQty}
                          className="w-20 border rounded p-1 text-right text-sm bg-background"
                          value={receiveQtys[item.id] ?? 0}
                          onChange={(e) => setReceiveQtys((q) => ({ ...q, [item.id]: Number(e.target.value) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiving(null)}>Cancel</Button>
            <Button
              disabled={receiveMutation.isPending}
              onClick={() => receiving && receiveMutation.mutate({
                id: receiving.id,
                items: receiving.items.map((item) => ({
                  purchaseOrderItemId: item.id,
                  receivedQty: receiveQtys[item.id] ?? 0,
                })),
              })}
            >
              {receiveMutation.isPending ? 'Receiving…' : 'Confirm Receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
