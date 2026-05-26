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
import { formatCurrency, formatDate } from '@/lib/utils';
import { Search, User, Star, CreditCard, ChevronRight, Plus, Pencil } from 'lucide-react';
import type { Customer, LoyaltyTransaction } from '@pos/types';

interface CustomerDetail {
  customer: Customer & { loyaltyTransactions?: LoyaltyTransaction[] };
  tab: 'info' | 'loyalty' | 'ar';
}

interface CustomerFormData {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

const EMPTY_FORM: CustomerFormData = { name: '', email: '', phone: '', notes: '' };

export function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [arPayAmount, setArPayAmount] = useState('');
  const [loyaltyAdjust, setLoyaltyAdjust] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () =>
      api.get('/customers', { params: { q: search || undefined, pageSize: 100 } }).then((r) => r.data),
  });

  const { data: loyaltyData } = useQuery({
    queryKey: ['loyalty', detail?.customer.id],
    enabled: !!detail?.customer.id && detail.tab === 'loyalty',
    queryFn: () =>
      api.get(`/loyalty/customers/${detail!.customer.id}`).then((r) => r.data.data),
  });

  const arPayMutation = useMutation({
    mutationFn: (amount: number) =>
      api.post(`/house-accounts/customers/${detail!.customer.id}/pay`, { amount, method: 'cash' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setArPayAmount('');
    },
  });

  const loyaltyAdjustMutation = useMutation({
    mutationFn: (points: number) =>
      api.post(`/loyalty/customers/${detail!.customer.id}/adjust`, { points, note: 'Manual adjustment' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty', detail?.customer.id] });
      setLoyaltyAdjust('');
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: object) =>
      editing
        ? api.patch(`/customers/${editing.id}`, payload).then((r) => r.data)
        : api.post('/customers', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDialogOpen(false);
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    },
  });

  const customers: Customer[] = data?.data ?? [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  }

  function openEdit(customer: Customer, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(customer);
    setForm({
      name: customer.name,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      notes: customer.notes ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) return setFormError('Name is required');
    saveMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (detail) {
    const c = detail.customer;
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>← Back</Button>
            <h1 className="text-2xl font-bold">{c.name}</h1>
          </div>
          <Button variant="outline" size="sm" onClick={(e) => openEdit(c, e)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        </div>

        <div className="flex gap-2">
          {(['info', 'loyalty', 'ar'] as const).map((tab) => (
            <Button
              key={tab}
              size="sm"
              variant={detail.tab === tab ? 'default' : 'outline'}
              onClick={() => setDetail({ ...detail, tab })}
            >
              {tab === 'info' ? 'Info' : tab === 'loyalty' ? 'Loyalty' : 'House Account'}
            </Button>
          ))}
        </div>

        {detail.tab === 'info' && (
          <div className="border rounded-lg p-4 space-y-3 text-sm">
            <Row label="Email" value={c.email ?? '—'} />
            <Row label="Phone" value={c.phone ?? '—'} />
            <Row label="Notes" value={c.notes ?? '—'} />
            <Row label="Tax Exempt" value={c.taxExempt ? 'Yes' : 'No'} />
            {c.taxExemptCertificate && <Row label="Certificate" value={c.taxExemptCertificate} />}
            <Row label="Email Receipts" value={c.emailReceiptsEnabled ? 'Enabled' : 'Disabled'} />
            <Row label="Customer Since" value={formatDate(c.createdAt)} />
          </div>
        )}

        {detail.tab === 'loyalty' && (
          <div className="space-y-4">
            <div className="border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                <span className="font-semibold text-lg">{c.loyaltyPoints.toLocaleString()} pts</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="±points"
                  value={loyaltyAdjust}
                  onChange={(e) => setLoyaltyAdjust(e.target.value)}
                  className="w-28"
                />
                <Button
                  size="sm"
                  disabled={!loyaltyAdjust || loyaltyAdjustMutation.isPending}
                  onClick={() => loyaltyAdjustMutation.mutate(Number(loyaltyAdjust))}
                >
                  Adjust
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-right p-3 font-medium">Points</th>
                    <th className="text-left p-3 font-medium">Note</th>
                    <th className="text-left p-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(loyaltyData?.transactions ?? []).map((t: LoyaltyTransaction) => (
                    <tr key={t.id}>
                      <td className="p-3">
                        <Badge variant={t.type === 'earn' ? 'success' : t.type === 'redeem' ? 'warning' : 'secondary'}>
                          {t.type}
                        </Badge>
                      </td>
                      <td className={`p-3 text-right font-medium ${t.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {t.points > 0 ? '+' : ''}{t.points}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{t.note ?? '—'}</td>
                      <td className="p-3 text-muted-foreground text-xs">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                  {(loyaltyData?.transactions ?? []).length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No transactions</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {detail.tab === 'ar' && (
          <div className="space-y-4">
            <div className="border rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(c.arBalance)}</p>
                {c.creditLimit != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Credit limit: {formatCurrency(c.creditLimit)} ({formatCurrency(c.creditLimit - c.arBalance)} available)
                  </p>
                )}
              </div>
              <CreditCard className="h-8 w-8 text-muted-foreground" />
            </div>

            {c.arBalance > 0 && (
              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-sm">Record Payment</h3>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={arPayAmount}
                    onChange={(e) => setArPayAmount(e.target.value)}
                    className="w-36"
                  />
                  <Button
                    disabled={!arPayAmount || Number(arPayAmount) <= 0 || arPayMutation.isPending}
                    onClick={() => arPayMutation.mutate(Number(arPayAmount))}
                  >
                    Apply Payment
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit dialog reused from list view */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Name *</Label>
                <Input id="c-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Phone</Label>
                <Input id="c-phone" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-notes">Notes</Label>
                <Input id="c-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Phone</th>
                <th className="text-right p-3 font-medium">Loyalty</th>
                <th className="text-right p-3 font-medium">Balance</th>
                <th className="text-left p-3 font-medium">Since</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setDetail({ customer, tab: 'info' })}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{customer.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{customer.email ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">{customer.phone ?? '—'}</td>
                  <td className="p-3 text-right text-xs">
                    {customer.loyaltyPoints > 0 ? (
                      <span className="text-yellow-600 font-medium">{customer.loyaltyPoints.toLocaleString()} pts</span>
                    ) : '—'}
                  </td>
                  <td className="p-3 text-right text-xs">
                    {customer.arBalance > 0 ? (
                      <span className="text-red-600 font-medium">{formatCurrency(customer.arBalance)}</span>
                    ) : '—'}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{formatDate(customer.createdAt)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={(e) => openEdit(customer, e)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">No customers found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name *</Label>
              <Input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input
                id="c-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="customer@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input
                id="c-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+1 555 000 0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Notes</Label>
              <Input
                id="c-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
