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
import { formatDate } from '@/lib/utils';
import { ClipboardCheck, Plus, CheckSquare, X } from 'lucide-react';

interface CycleCountItem {
  id: string;
  productId: string;
  variantId?: string;
  expectedQty: number;
  countedQty?: number;
  countedAt?: string;
  note?: string;
  product?: { id: string; name: string; sku?: string } | null;
}

interface CycleCount {
  id: string;
  name: string;
  locationId: string;
  status: string;
  startedAt: string;
  closedAt?: string;
  notes?: string;
  items: CycleCountItem[];
}

export function CycleCountPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CycleCount | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ locationId: '', name: '', notes: '' });
  const [createError, setCreateError] = useState('');
  const [countInputs, setCountInputs] = useState<Record<string, string>>({});

  const { data: counts = [], isLoading } = useQuery<CycleCount[]>({
    queryKey: ['cycle-counts'],
    queryFn: () => api.get('/cycle-counts').then((r) => r.data.data),
  });

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data.data),
  });
  const locations: { id: string; name: string }[] = locationsData ?? [];

  const { data: detail, isLoading: detailLoading } = useQuery<CycleCount>({
    queryKey: ['cycle-count', selected?.id],
    queryFn: () => api.get(`/cycle-counts/${selected!.id}`).then((r) => r.data.data),
    enabled: !!selected,
  });

  const createMutation = useMutation({
    mutationFn: (v: object) => api.post('/cycle-counts', v).then((r) => r.data.data as CycleCount),
    onSuccess: (cc) => {
      qc.invalidateQueries({ queryKey: ['cycle-counts'] });
      setCreateOpen(false);
      setCreateForm({ locationId: '', name: '', notes: '' });
      setCreateError('');
      setSelected(cc);
    },
    onError: (err: unknown) => setCreateError(err instanceof Error ? err.message : 'Failed to create'),
  });

  const countMutation = useMutation({
    mutationFn: ({ itemId, countedQty, note }: { itemId: string; countedQty: number; note?: string }) =>
      api.patch(`/cycle-counts/${selected!.id}/items/${itemId}`, { countedQty, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cycle-count', selected?.id] }),
  });

  const closeMutation = useMutation({
    mutationFn: (applyAdjustments: boolean) =>
      api.post(`/cycle-counts/${selected!.id}/close`, { applyAdjustments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cycle-counts'] });
      qc.invalidateQueries({ queryKey: ['cycle-count', selected?.id] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/cycle-counts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cycle-counts'] });
      setSelected(null);
    },
  });

  const items = detail?.items ?? [];
  const counted = items.filter((i) => i.countedQty != null).length;
  const uncounted = items.length - counted;
  const variances = items.filter((i) => i.countedQty != null && i.countedQty !== i.expectedQty);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cycle Counts</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />New Count
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: list */}
        <div className="space-y-2">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {!isLoading && counts.length === 0 && (
            <p className="text-sm text-muted-foreground">No cycle counts yet.</p>
          )}
          {counts.map((cc) => (
            <button
              key={cc.id}
              className={`w-full text-left border rounded-lg p-3 text-sm transition-colors hover:border-primary ${selected?.id === cc.id ? 'border-primary bg-primary/5' : ''}`}
              onClick={() => { setSelected(cc); setCountInputs({}); }}
            >
              <div className="flex justify-between items-start gap-2">
                <p className="font-medium">{cc.name}</p>
                <Badge variant={cc.status === 'open' ? 'default' : 'secondary'} className="text-xs shrink-0">
                  {cc.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{formatDate(cc.startedAt)}</p>
            </button>
          ))}
        </div>

        {/* Right: detail */}
        <div className="lg:col-span-2">
          {!selected && (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select a cycle count to start counting</p>
            </div>
          )}

          {selected && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{detail?.name ?? selected.name}</h2>
                  {detail?.notes && <p className="text-sm text-muted-foreground">{detail.notes}</p>}
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{counted} counted</span>
                    <span>{uncounted} remaining</span>
                    <span>{variances.length} variances</span>
                  </div>
                </div>
                {detail?.status === 'open' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate(selected.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />Delete
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => closeMutation.mutate(true)}
                      disabled={closeMutation.isPending}
                    >
                      <CheckSquare className="h-3.5 w-3.5 mr-1" />
                      {closeMutation.isPending ? 'Closing…' : 'Close & Apply'}
                    </Button>
                  </div>
                )}
              </div>

              {detailLoading ? (
                <p className="text-muted-foreground">Loading items…</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Product</th>
                        <th className="text-right p-3 font-medium">Expected</th>
                        <th className="text-right p-3 font-medium">Counted</th>
                        <th className="text-right p-3 font-medium">Variance</th>
                        {detail?.status === 'open' && <th className="p-3" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item) => {
                        const variance = item.countedQty != null ? item.countedQty - item.expectedQty : null;
                        return (
                          <tr key={item.id} className="hover:bg-muted/30">
                            <td className="p-3">
                              <p className="font-medium">{item.product?.name ?? item.productId}</p>
                              {item.product?.sku && <p className="text-xs text-muted-foreground">{item.product.sku}</p>}
                            </td>
                            <td className="p-3 text-right tabular-nums">{item.expectedQty}</td>
                            <td className="p-3 text-right tabular-nums">
                              {item.countedQty != null ? item.countedQty : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {variance != null ? (
                                <span className={variance === 0 ? 'text-green-600' : variance > 0 ? 'text-blue-600' : 'text-destructive'}>
                                  {variance > 0 ? '+' : ''}{variance}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            {detail?.status === 'open' && (
                              <td className="p-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <Input
                                    type="number"
                                    min="0"
                                    className="w-20 h-7 text-sm"
                                    value={countInputs[item.id] ?? ''}
                                    onChange={(e) => setCountInputs((p) => ({ ...p, [item.id]: e.target.value }))}
                                    placeholder="qty"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    disabled={!countInputs[item.id] || countMutation.isPending}
                                    onClick={() => {
                                      const qty = parseFloat(countInputs[item.id]);
                                      if (!isNaN(qty) && qty >= 0) {
                                        countMutation.mutate({ itemId: item.id, countedQty: qty });
                                        setCountInputs((p) => ({ ...p, [item.id]: '' }));
                                      }
                                    }}
                                  >
                                    Save
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {items.length === 0 && (
                        <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No items</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setCreateError(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Cycle Count</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Location *</Label>
              <Select value={createForm.locationId} onValueChange={(v) => setCreateForm((f) => ({ ...f, locationId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select location…" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Full Store Count — May 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={createForm.notes}
                onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              All inventory items at the selected location will be included. Snapshot quantities are captured at creation time.
            </p>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button
              disabled={!createForm.locationId || !createForm.name || createMutation.isPending}
              onClick={() => createMutation.mutate(createForm)}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Count'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
