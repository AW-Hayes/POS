import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { ShoppingCart, Plus, Trash2, RefreshCw } from 'lucide-react';
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

interface LineItem {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  orderedQty: number;
  unitCost: number;
  variants: { id: string; sku?: string; attributeValues: { value: string }[] }[];
}

export function PurchaseOrdersPage() {
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const qc = useQueryClient();

  // Create PO dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createLocationId, setCreateLocationId] = useState('');
  const [createVendorId, setCreateVendorId] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createError, setCreateError] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // Reorder generation dialog
  const [showReorder, setShowReorder] = useState(false);
  const [reorderLocationId, setReorderLocationId] = useState('');
  const [reorderResult, setReorderResult] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', status],
    queryFn: () =>
      api.get('/purchase-orders', { params: { status: status || undefined } }).then((r) => r.data),
  });
  const pos: PurchaseOrder[] = data?.data ?? [];

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data.data),
  });
  const locations: { id: string; name: string }[] = locationsData ?? [];

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api.get('/vendors').then((r) => r.data.data),
  });
  const vendors: { id: string; name: string }[] = vendorsData ?? [];

  const { data: productSearchData } = useQuery({
    queryKey: ['products-search-po', productSearch],
    queryFn: () =>
      api.get('/products', { params: { q: productSearch || undefined, pageSize: 20 } }).then((r) => r.data.data),
    enabled: showCreate && productSearch.length > 0,
  });
  const productResults: {
    id: string; name: string; sku?: string; cost?: number;
    variants: { id: string; sku?: string; attributeValues: { value: string }[] }[];
  }[] = productSearchData ?? [];

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

  const createMutation = useMutation({
    mutationFn: (payload: object) => api.post('/purchase-orders', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setShowCreate(false);
      resetCreate();
    },
    onError: (err: unknown) => {
      setCreateError(err instanceof Error ? err.message : 'Failed to create purchase order');
    },
  });

  function resetCreate() {
    setCreateLocationId('');
    setCreateVendorId('');
    setCreateNotes('');
    setCreateError('');
    setLineItems([]);
    setProductSearch('');
  }

  function addProductToLines(p: typeof productResults[number]) {
    setLineItems((prev) => [
      ...prev,
      {
        productId: p.id,
        productName: p.name,
        variantId: '',
        variantLabel: '',
        orderedQty: 1,
        unitCost: p.cost ?? 0,
        variants: p.variants,
      },
    ]);
    setProductSearch('');
  }

  function updateLine(index: number, patch: Partial<LineItem>) {
    setLineItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, ...patch };
      if (patch.variantId !== undefined) {
        const v = item.variants.find((v) => v.id === patch.variantId);
        updated.variantLabel = v ? v.attributeValues.map((av) => av.value).join(' / ') : '';
      }
      return updated;
    }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (!createLocationId) return setCreateError('Select a location');
    if (lineItems.length === 0) return setCreateError('Add at least one line item');

    createMutation.mutate({
      locationId: createLocationId,
      vendorId: createVendorId || undefined,
      notes: createNotes.trim() || undefined,
      items: lineItems.map((li) => ({
        productId: li.productId,
        variantId: li.variantId || undefined,
        orderedQty: li.orderedQty,
        unitCost: li.unitCost,
      })),
    });
  }

  const [generatingReorder, setGeneratingReorder] = useState(false);

  async function handleGenerateReorder() {
    setReorderError('');
    setReorderResult(null);
    if (!reorderLocationId) return setReorderError('Select a location');

    setGeneratingReorder(true);
    try {
      const res = await api.get('/inventory/below-reorder', { params: { locationId: reorderLocationId } });
      const items: {
        productId: string;
        variantId: string | null;
        reorderQty: number | null;
        product: {
          id: string; name: string; cost: number | null;
          preferredVendorId: string | null;
          preferredVendor: { id: string; name: string } | null;
        };
      }[] = res.data.data;

      if (items.length === 0) {
        setReorderResult('No items are currently below their reorder point.');
        setGeneratingReorder(false);
        return;
      }

      // Group by preferredVendorId (null = no vendor)
      const groups = new Map<string | null, typeof items>();
      for (const item of items) {
        const key = item.product.preferredVendorId ?? null;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      const created: string[] = [];
      for (const [vendorId, groupItems] of groups) {
        const vendor = groupItems[0].product.preferredVendor;
        await api.post('/purchase-orders', {
          locationId: reorderLocationId,
          vendorId: vendorId ?? undefined,
          notes: `Auto-generated from reorder points`,
          items: groupItems
            .filter((i) => (i.reorderQty ?? 0) > 0)
            .map((i) => ({
              productId: i.productId,
              variantId: i.variantId ?? undefined,
              orderedQty: Math.ceil(i.reorderQty!),
              unitCost: i.product.cost ?? 0,
            })),
        });
        created.push(vendor?.name ?? 'No vendor');
      }

      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setReorderResult(
        `Created ${created.length} draft PO${created.length !== 1 ? 's' : ''}: ${created.join(', ')}.`
      );
    } catch (err) {
      setReorderError(err instanceof Error ? err.message : 'Failed to generate purchase orders');
    } finally {
      setGeneratingReorder(false);
    }
  }

  function openReceive(po: PurchaseOrder) {
    const qtys: Record<string, number> = {};
    for (const item of po.items) {
      qtys[item.id] = item.orderedQty - item.receivedQty;
    }
    setReceiveQtys(qtys);
    setReceiving(po);
  }

  const createLineTotal = lineItems.reduce((s, li) => s + li.orderedQty * li.unitCost, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowReorder(true); setReorderResult(null); setReorderError(''); }}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Generate from Reorder Points
          </Button>
          <Button size="sm" onClick={() => { setShowCreate(true); resetCreate(); }}>
            <Plus className="h-4 w-4 mr-1" />
            New PO
          </Button>
        </div>
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

      {/* Create PO dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) { setShowCreate(false); resetCreate(); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Location *</Label>
                <Select value={createLocationId} onValueChange={setCreateLocationId}>
                  <SelectTrigger><SelectValue placeholder="Select location…" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Select value={createVendorId} onValueChange={setCreateVendorId}>
                  <SelectTrigger><SelectValue placeholder="No vendor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No vendor</SelectItem>
                    {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} placeholder="Optional notes" />
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <Label>Line Items *</Label>
              <div className="space-y-1.5">
                <Input
                  placeholder="Search products to add…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                {productResults.length > 0 && productSearch.length > 0 && (
                  <div className="border rounded-md max-h-36 overflow-y-auto divide-y text-sm">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                        onClick={() => addProductToLines(p)}
                      >
                        <span className="font-medium">{p.name}</span>
                        {p.sku && <span className="text-muted-foreground ml-2 text-xs">{p.sku}</span>}
                        {p.cost != null && <span className="text-muted-foreground ml-2 text-xs">cost {formatCurrency(p.cost)}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lineItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Product</th>
                        <th className="text-left p-2 font-medium">Variant</th>
                        <th className="text-right p-2 font-medium">Qty</th>
                        <th className="text-right p-2 font-medium">Unit Cost</th>
                        <th className="text-right p-2 font-medium">Line Total</th>
                        <th className="p-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lineItems.map((li, i) => (
                        <tr key={i}>
                          <td className="p-2 font-medium">{li.productName}</td>
                          <td className="p-2">
                            {li.variants.length > 0 ? (
                              <Select
                                value={li.variantId}
                                onValueChange={(v) => updateLine(i, { variantId: v })}
                              >
                                <SelectTrigger className="h-7 text-xs w-32">
                                  <SelectValue placeholder="Base" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">Base product</SelectItem>
                                  {li.variants.map((v) => (
                                    <SelectItem key={v.id} value={v.id}>
                                      {v.attributeValues.map((av) => av.value).join(' / ')}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={1}
                              className="w-16 border rounded p-1 text-right text-sm bg-background"
                              value={li.orderedQty}
                              onChange={(e) => updateLine(i, { orderedQty: Math.max(1, Number(e.target.value)) })}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-20 border rounded p-1 text-right text-sm bg-background"
                              value={li.unitCost}
                              onChange={(e) => updateLine(i, { unitCost: Math.max(0, Number(e.target.value)) })}
                            />
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {formatCurrency(li.orderedQty * li.unitCost)}
                          </td>
                          <td className="p-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setLineItems((prev) => prev.filter((_, idx) => idx !== i))}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30">
                      <tr>
                        <td colSpan={4} className="p-2 text-right font-medium text-sm">Total</td>
                        <td className="p-2 text-right font-semibold tabular-nums">{formatCurrency(createLineTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create Draft PO'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate from Reorder Points dialog */}
      <Dialog open={showReorder} onOpenChange={(o) => { if (!o) { setShowReorder(false); setReorderResult(null); setReorderError(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate from Reorder Points</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates one draft PO per vendor for all products currently below their reorder point.
              Items with no preferred vendor are grouped into a single PO.
            </p>

            <div className="space-y-1.5">
              <Label>Location *</Label>
              <Select value={reorderLocationId} onValueChange={setReorderLocationId}>
                <SelectTrigger><SelectValue placeholder="Select location…" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {reorderResult && (
              <p className="text-sm text-green-600 dark:text-green-400">{reorderResult}</p>
            )}
            {reorderError && <p className="text-sm text-destructive">{reorderError}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            <Button onClick={handleGenerateReorder} disabled={generatingReorder}>
              {generatingReorder ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
