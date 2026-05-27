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
import { Wrench, Plus, Trash2 } from 'lucide-react';

interface TicketItem {
  id: string;
  type: 'labor' | 'part';
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface ServiceTicket {
  id: string;
  ticketNumber?: string;
  status: string;
  description?: string;
  techNotes?: string;
  estimatedCost?: number;
  finalCost?: number;
  customerId?: string;
  createdAt: string;
  completedAt?: string;
  items: TicketItem[];
}

const STATUSES = ['open', 'in_progress', 'ready', 'completed', 'cancelled'] as const;
const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled',
};
const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'success' | 'destructive'> = {
  open: 'default', in_progress: 'default', ready: 'success', completed: 'secondary', cancelled: 'destructive',
};

export function ServiceTicketsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ServiceTicket | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ locationId: '', description: '', estimatedCost: '' });
  const [createError, setCreateError] = useState('');
  const [addItemForm, setAddItemForm] = useState({ type: 'labor', name: '', quantity: '1', unitPrice: '' });
  const [statusFilter, setStatusFilter] = useState('');

  const { data: tickets = [], isLoading } = useQuery<ServiceTicket[]>({
    queryKey: ['service-tickets', statusFilter],
    queryFn: () =>
      api.get('/service-tickets', { params: { status: statusFilter || undefined, pageSize: 100 } }).then((r) => r.data.data),
  });

  const { data: detail } = useQuery<ServiceTicket>({
    queryKey: ['service-ticket', selected?.id],
    queryFn: () => api.get(`/service-tickets/${selected!.id}`).then((r) => r.data.data),
    enabled: !!selected,
  });

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data.data),
  });
  const locations: { id: string; name: string }[] = locationsData ?? [];

  const createMutation = useMutation({
    mutationFn: (v: object) => api.post('/service-tickets', v).then((r) => r.data.data as ServiceTicket),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['service-tickets'] });
      setCreateOpen(false);
      setCreateForm({ locationId: '', description: '', estimatedCost: '' });
      setCreateError('');
      setSelected(t);
    },
    onError: (err: unknown) => setCreateError(err instanceof Error ? err.message : 'Failed'),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch(`/service-tickets/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-tickets'] });
      qc.invalidateQueries({ queryKey: ['service-ticket', selected?.id] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (data: object) => api.post(`/service-tickets/${selected!.id}/items`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-ticket', selected?.id] });
      setAddItemForm({ type: 'labor', name: '', quantity: '1', unitPrice: '' });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/service-tickets/${selected!.id}/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-ticket', selected?.id] }),
  });

  const items = detail?.items ?? [];
  const itemsTotal = items.reduce((s, i) => s + i.total, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Service Tickets</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />New Ticket
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['', ...STATUSES] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
          >
            {s === '' ? 'All' : STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket list */}
        <div className="space-y-2">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {!isLoading && tickets.length === 0 && (
            <p className="text-sm text-muted-foreground">No tickets found.</p>
          )}
          {tickets.map((t) => (
            <button
              key={t.id}
              className={`w-full text-left border rounded-lg p-3 text-sm transition-colors hover:border-primary ${selected?.id === t.id ? 'border-primary bg-primary/5' : ''}`}
              onClick={() => setSelected(t)}
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-medium">{t.ticketNumber ?? t.id.slice(-6).toUpperCase()}</span>
                <Badge variant={STATUS_VARIANTS[t.status] ?? 'secondary'} className="text-xs shrink-0">
                  {STATUS_LABELS[t.status] ?? t.status}
                </Badge>
              </div>
              {t.description && <p className="text-xs text-muted-foreground mt-1 truncate">{t.description}</p>}
              <p className="text-xs text-muted-foreground mt-1">{formatDate(t.createdAt)}</p>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2">
          {!selected && (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <Wrench className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select a ticket to view details</p>
            </div>
          )}

          {selected && detail && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{detail.ticketNumber ?? detail.id.slice(-6).toUpperCase()}</h2>
                  <p className="text-sm text-muted-foreground">{formatDate(detail.createdAt)}</p>
                </div>
                <Select
                  value={detail.status}
                  onValueChange={(v) => patchMutation.mutate({ id: detail.id, data: { status: v } })}
                >
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {detail.description && (
                <div className="border rounded-md p-3 text-sm bg-muted/30">
                  <p className="font-medium text-xs text-muted-foreground uppercase mb-1">Description</p>
                  <p>{detail.description}</p>
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Item</th>
                      <th className="text-center p-3 font-medium">Type</th>
                      <th className="text-right p-3 font-medium">Qty</th>
                      <th className="text-right p-3 font-medium">Unit</th>
                      <th className="text-right p-3 font-medium">Total</th>
                      {detail.status !== 'completed' && <th className="p-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="p-3 font-medium">{item.name}</td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className="text-xs">{item.type}</Badge>
                        </td>
                        <td className="p-3 text-right tabular-nums">{item.quantity}</td>
                        <td className="p-3 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
                        <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(item.total)}</td>
                        {detail.status !== 'completed' && (
                          <td className="p-3">
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteItemMutation.mutate(item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No items yet</td></tr>
                    )}
                    <tr className="bg-muted/30 font-semibold">
                      <td colSpan={4} className="p-3 text-right">Total</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(itemsTotal)}</td>
                      {detail.status !== 'completed' && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>

              {detail.status !== 'completed' && detail.status !== 'cancelled' && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-sm">Add Line Item</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={addItemForm.type} onValueChange={(v) => setAddItemForm((f) => ({ ...f, type: v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="labor">Labor</SelectItem>
                          <SelectItem value="part">Part</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Name *</Label>
                      <Input className="h-8 text-sm" value={addItemForm.name} onChange={(e) => setAddItemForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Diagnostic, Screen" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input className="h-8 text-sm" type="number" min="0.01" step="0.01" value={addItemForm.quantity} onChange={(e) => setAddItemForm((f) => ({ ...f, quantity: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unit Price *</Label>
                      <Input className="h-8 text-sm" type="number" min="0" step="0.01" value={addItemForm.unitPrice} onChange={(e) => setAddItemForm((f) => ({ ...f, unitPrice: e.target.value }))} placeholder="0.00" />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={!addItemForm.name || !addItemForm.unitPrice || addItemMutation.isPending}
                    onClick={() => addItemMutation.mutate({
                      type: addItemForm.type,
                      name: addItemForm.name,
                      quantity: parseFloat(addItemForm.quantity) || 1,
                      unitPrice: parseFloat(addItemForm.unitPrice),
                    })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />Add
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setCreateError(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Service Ticket</DialogTitle></DialogHeader>
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
              <Label>Description</Label>
              <Input value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} placeholder="What needs to be done?" />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Cost</Label>
              <Input type="number" min="0" step="0.01" value={createForm.estimatedCost} onChange={(e) => setCreateForm((f) => ({ ...f, estimatedCost: e.target.value }))} placeholder="0.00" />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button
              disabled={!createForm.locationId || createMutation.isPending}
              onClick={() => createMutation.mutate({
                locationId: createForm.locationId,
                description: createForm.description || undefined,
                estimatedCost: createForm.estimatedCost ? parseFloat(createForm.estimatedCost) : undefined,
              })}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
