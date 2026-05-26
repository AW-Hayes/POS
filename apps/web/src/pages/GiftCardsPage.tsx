import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';
import { Search, CreditCard, Plus } from 'lucide-react';
import type { GiftCard } from '@pos/types';

export function GiftCardsPage() {
  const [search, setSearch] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({ code: '', initialBalance: '', expiresAt: '' });
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['gift-cards', search],
    queryFn: () =>
      api.get('/gift-cards', { params: { q: search || undefined } }).then((r) => r.data),
  });

  const cards: GiftCard[] = data?.data ?? [];

  const issueMutation = useMutation({
    mutationFn: (v: object) => api.post('/gift-cards/issue', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gift-cards'] });
      setIssueOpen(false);
      setIssueForm({ code: '', initialBalance: '', expiresAt: '' });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => api.post(`/gift-cards/${id}/void`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gift-cards'] }),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gift Cards</h1>
        <Button size="sm" onClick={() => setIssueOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Issue Gift Card
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by code…"
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
                <th className="text-left p-3 font-medium">Code</th>
                <th className="text-right p-3 font-medium">Balance</th>
                <th className="text-right p-3 font-medium">Initial</th>
                <th className="text-left p-3 font-medium">Issued</th>
                <th className="text-left p-3 font-medium">Expires</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {cards.map((c) => {
                const expired = c.expiresAt != null && new Date(c.expiresAt) < new Date();
                return (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-xs">{c.code}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(c.balance)}</td>
                    <td className="p-3 text-right text-muted-foreground">{formatCurrency(c.initialBalance)}</td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {new Date(c.issuedAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={!c.active || expired ? 'destructive' : 'success'}>
                        {!c.active ? 'Voided' : expired ? 'Expired' : 'Active'}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      {c.active && !expired && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => { if (confirm('Void this gift card?')) voidMutation.mutate(c.id); }}
                        >
                          Void
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {cards.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No gift cards</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue Gift Card</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Code (leave blank to auto-generate)</label>
              <Input
                placeholder="e.g. GIFT-1234-ABCD"
                value={issueForm.code}
                onChange={(e) => setIssueForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Initial Balance ($) *</label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                value={issueForm.initialBalance}
                onChange={(e) => setIssueForm((f) => ({ ...f, initialBalance: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Expires At (optional)</label>
              <Input
                type="date"
                value={issueForm.expiresAt}
                onChange={(e) => setIssueForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button
              disabled={issueMutation.isPending || !issueForm.initialBalance}
              onClick={() => issueMutation.mutate({
                code: issueForm.code || undefined,
                initialBalance: Number(issueForm.initialBalance),
                expiresAt: issueForm.expiresAt ? new Date(issueForm.expiresAt).toISOString() : undefined,
              })}
            >
              {issueMutation.isPending ? 'Issuing…' : 'Issue Card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
