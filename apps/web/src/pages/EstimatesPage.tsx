import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';
import { FileText, Trash2, ShoppingCart, Clock } from 'lucide-react';
import type { Order } from '@pos/types';

export function EstimatesPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Order | null>(null);

  const { data: estimates = [], isLoading } = useQuery<Order[]>({
    queryKey: ['estimates'],
    queryFn: () => api.get('/estimates').then((r) => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/estimates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['estimates'] }),
  });

  function isExpired(estimate: Order) {
    return estimate.estimateExpiresAt && new Date(estimate.estimateExpiresAt) < new Date();
  }

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Estimates</h1>
          <p className="text-sm text-muted-foreground mt-1">Saved quotes that can be converted to orders</p>
        </div>
        <Badge variant="secondary">{estimates.length} active</Badge>
      </div>

      {estimates.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No estimates yet. Use the "Estimate" button on the Terminal to save a quote.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {estimates.map((estimate) => (
          <Card
            key={estimate.id}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setSelected(estimate)}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{estimate.customer?.name ?? 'Walk-in'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(estimate.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={isExpired(estimate) ? 'destructive' : 'outline'}>
                  {isExpired(estimate) ? 'Expired' : 'Active'}
                </Badge>
              </div>

              <div className="text-sm space-y-0.5">
                {estimate.items.slice(0, 3).map((item) => (
                  <p key={item.id} className="truncate text-muted-foreground">
                    {item.quantity}× {item.name}
                  </p>
                ))}
                {estimate.items.length > 3 && (
                  <p className="text-xs text-muted-foreground">+{estimate.items.length - 3} more</p>
                )}
              </div>

              <div className="flex items-center justify-between border-t pt-2">
                <span className="font-semibold">{formatCurrency(estimate.total)}</span>
                {estimate.estimateExpiresAt && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Exp {new Date(estimate.estimateExpiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Estimate — {selected?.customer?.name ?? 'Walk-in'}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-md border divide-y">
                {selected.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="flex-1">{item.name}</span>
                    <span className="text-muted-foreground mx-4">×{item.quantity}</span>
                    <span className="font-medium">{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(selected.subtotal)}</span>
                </div>
                {selected.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{formatCurrency(selected.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total</span>
                  <span>{formatCurrency(selected.total)}</span>
                </div>
              </div>

              {selected.notes && (
                <p className="text-sm text-muted-foreground italic">{selected.notes}</p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { deleteMutation.mutate(selected!.id); setSelected(null); }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            <Button
              onClick={() => {
                // Navigate to terminal with cart pre-loaded via localStorage signal
                localStorage.setItem('pos_load_estimate', selected!.id);
                window.location.href = '/terminal';
              }}
            >
              <ShoppingCart className="h-4 w-4 mr-1" />
              Convert to Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
