import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Plus, Building2 } from 'lucide-react';
import type { Vendor } from '@pos/types';

const empty = (): Partial<Vendor> => ({
  name: '', code: '', email: '', phone: '', address: '', notes: '', active: true,
});

export function VendorsPage() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState<Partial<Vendor>>(empty());
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', search],
    queryFn: () => api.get('/vendors', { params: { q: search || undefined } }).then((r) => r.data),
  });

  const vendors: Vendor[] = data?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: (v: Partial<Vendor>) =>
      editing ? api.put(`/vendors/${editing.id}`, v) : api.post('/vendors', v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); closeDialog(); },
  });

  function openCreate() { setEditing(null); setForm(empty()); setOpen(true); }
  function openEdit(v: Vendor) { setEditing(v); setForm(v); setOpen(true); }
  function closeDialog() { setOpen(false); setEditing(null); }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vendors</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Vendor
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Code</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Phone</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{v.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{v.code ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">{v.email ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">{v.phone ?? '—'}</td>
                  <td className="p-3 text-center">
                    <Badge variant={v.active ? 'success' : 'secondary'}>{v.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>Edit</Button>
                  </td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No vendors found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {[
              { label: 'Name *', key: 'name' as const },
              { label: 'Code', key: 'code' as const },
              { label: 'Email', key: 'email' as const },
              { label: 'Phone', key: 'phone' as const },
              { label: 'Address', key: 'address' as const },
            ].map(({ label, key }) => (
              <div key={key} className="space-y-1">
                <label className="text-sm font-medium">{label}</label>
                <Input
                  value={(form[key] as string) ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                className="w-full border rounded-md p-2 text-sm min-h-[80px] bg-background"
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.name}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
