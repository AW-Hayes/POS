import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Layers } from 'lucide-react';
import type { PriceLevel } from '@pos/types';

const empty = () => ({ name: '', description: '', discount: '0' });

export function PriceLevelsPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PriceLevel | null>(null);
  const [form, setForm] = useState(empty());
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['price-levels'],
    queryFn: () => api.get('/price-levels').then((r) => r.data),
  });

  const levels: PriceLevel[] = data?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: (v: object) =>
      editing ? api.put(`/price-levels/${editing.id}`, v) : api.post('/price-levels', v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['price-levels'] }); closeDialog(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/price-levels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-levels'] }),
  });

  function openCreate() { setEditing(null); setForm(empty()); setOpen(true); }
  function openEdit(l: PriceLevel) {
    setEditing(l);
    setForm({ name: l.name, description: l.description ?? '', discount: String(l.discount) });
    setOpen(true);
  }
  function closeDialog() { setOpen(false); setEditing(null); }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Price Levels</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Price Level
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Price levels let you offer tiered pricing to specific customer groups (e.g. wholesale, VIP).
        Assign a price level to a customer to automatically apply discounts or product-specific prices.
      </p>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-right p-3 font-medium">Default Discount</th>
                <th className="text-right p-3 font-medium">Product Prices</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {levels.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{l.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{l.description ?? '—'}</td>
                  <td className="p-3 text-right">{l.discount > 0 ? `${l.discount}% off` : '—'}</td>
                  <td className="p-3 text-right">{l.prices?.length ?? 0}</td>
                  <td className="p-3 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(l)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => { if (confirm('Delete this price level?')) deleteMutation.mutate(l.id); }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {levels.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No price levels</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Price Level' : 'Add Price Level'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name *</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Default Discount (% off retail)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.discount}
                onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Applied when no product-specific price is set for this level.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              disabled={saveMutation.isPending || !form.name}
              onClick={() => saveMutation.mutate({ ...form, discount: Number(form.discount) })}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
