import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Tag } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Promotion, PromotionType } from '@pos/types';

const PROMO_TYPES: Array<{ value: PromotionType; label: string }> = [
  { value: 'percent_off', label: '% Off' },
  { value: 'fixed_off', label: '$ Off' },
  { value: 'bogo', label: 'Buy One Get One' },
  { value: 'price_override', label: 'Price Override' },
];

const empty = () => ({
  name: '',
  type: 'percent_off' as PromotionType,
  value: 0,
  minQty: '' as string | number,
  minAmount: '' as string | number,
  startsAt: '',
  endsAt: '',
  active: true,
});

export function PromotionsPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState(empty());
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => api.get('/promotions').then((r) => r.data),
  });

  const promotions: Promotion[] = data?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: (v: object) =>
      editing ? api.put(`/promotions/${editing.id}`, v) : api.post('/promotions', v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promotions'] }); closeDialog(); },
  });

  const toggleMutation = useMutation({
    mutationFn: (p: Promotion) => api.put(`/promotions/${p.id}`, { active: !p.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  });

  function openCreate() { setEditing(null); setForm(empty()); setOpen(true); }
  function openEdit(p: Promotion) {
    setEditing(p);
    setForm({
      name: p.name,
      type: p.type,
      value: p.value,
      minQty: p.minQty ?? '',
      minAmount: p.minAmount ?? '',
      startsAt: p.startsAt ? p.startsAt.slice(0, 16) : '',
      endsAt: p.endsAt ? p.endsAt.slice(0, 16) : '',
      active: p.active,
    });
    setOpen(true);
  }
  function closeDialog() { setOpen(false); setEditing(null); }

  function formatValue(p: Promotion) {
    if (p.type === 'percent_off') return `${p.value}% off`;
    if (p.type === 'fixed_off') return `${formatCurrency(p.value)} off`;
    if (p.type === 'bogo') return 'Buy 1 Get 1';
    return `Override: ${formatCurrency(p.value)}`;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Promotions</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Promotion
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Value</th>
                <th className="text-left p-3 font-medium">Valid</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {promotions.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{PROMO_TYPES.find((t) => t.value === p.type)?.label}</td>
                  <td className="p-3 font-medium">{formatValue(p)}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {p.startsAt ? new Date(p.startsAt).toLocaleDateString() : '—'}
                    {' → '}
                    {p.endsAt ? new Date(p.endsAt).toLocaleDateString() : '∞'}
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant={p.active ? 'success' : 'secondary'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="p-3 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate(p)}>
                      {p.active ? 'Disable' : 'Enable'}
                    </Button>
                  </td>
                </tr>
              ))}
              {promotions.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No promotions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Promotion' : 'Add Promotion'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name *</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Type</label>
                <Select value={form.type} onValueChange={(v: string) => setForm((f) => ({ ...f, type: v as PromotionType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROMO_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {form.type === 'percent_off' ? 'Percent (%)' : form.type === 'bogo' ? 'N/A' : 'Amount ($)'}
                </label>
                <Input
                  type="number"
                  min={0}
                  disabled={form.type === 'bogo'}
                  value={form.type === 'bogo' ? '' : form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Min Qty</label>
                <Input
                  type="number" min={1}
                  value={form.minQty}
                  onChange={(e) => setForm((f) => ({ ...f, minQty: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Min Amount ($)</label>
                <Input
                  type="number" min={0}
                  value={form.minAmount}
                  onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Starts At</label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Ends At</label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              disabled={saveMutation.isPending || !form.name}
              onClick={() => saveMutation.mutate({
                ...form,
                minQty: form.minQty !== '' ? Number(form.minQty) : undefined,
                minAmount: form.minAmount !== '' ? Number(form.minAmount) : undefined,
                startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
                endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
              })}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
