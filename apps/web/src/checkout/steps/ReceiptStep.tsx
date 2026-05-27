import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CheckCircle, Printer, Mail, Check } from 'lucide-react';
import type { StepProps } from '../types';
import type { Order } from '@pos/types';

export function ReceiptStep({ state, onAdvance }: StepProps) {
  const { data: order } = useQuery({
    queryKey: ['orders', state.orderId],
    queryFn: () => api.get(`/orders/${state.orderId}`).then((r) => r.data.data as Order),
    enabled: !!state.orderId,
  });

  const [emailInput, setEmailInput] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const emailMutation = useMutation({
    mutationFn: (email: string) =>
      api.post(`/receipts/orders/${state.orderId}/email`, { email: email || undefined }),
    onSuccess: () => setEmailSent(true),
  });

  const subtotal = state.cart.reduce((s, i) => s + (i.price - i.discount) * i.quantity, 0);
  const totalPaid = state.payments.reduce((s, p) => s + p.amount, 0);
  const change = Math.max(0, totalPaid - (order?.total ?? subtotal));

  const customerEmail = (order?.customer as { email?: string | null } | undefined)?.email ?? undefined;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <div className="flex justify-center">
          <div className="rounded-full bg-green-100 p-3">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <p className="font-semibold text-lg">Order Complete</p>
        {order && (
          <p className="text-xs text-muted-foreground font-mono">
            #{order.id.slice(-8).toUpperCase()}
          </p>
        )}
      </div>

      {/* Order summary */}
      <div className="border rounded-lg divide-y text-sm">
        {state.cart.map((item, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2">
            <span className="truncate flex-1">
              {item.name}
              {item.quantity > 1 && (
                <span className="text-muted-foreground ml-1">×{item.quantity}</span>
              )}
            </span>
            <span className="tabular-nums font-medium">
              {formatCurrency((item.price - item.discount) * item.quantity)}
            </span>
          </div>
        ))}
        {order && (
          <>
            {order.taxAmount > 0 && (
              <div className="flex justify-between px-3 py-2 text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatCurrency(order.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between px-3 py-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(order.total)}</span>
            </div>
          </>
        )}
      </div>

      {/* Payments */}
      <div className="space-y-1">
        {state.payments.map((p, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="capitalize">{p.method}</Badge>
              {p.reference && (
                <span className="text-xs text-muted-foreground">{p.reference}</span>
              )}
            </div>
            <span className="tabular-nums">{formatCurrency(p.amount)}</span>
          </div>
        ))}
        {change > 0 && (
          <div className="flex justify-between text-sm text-green-600 font-medium pt-1 border-t">
            <span>Change</span>
            <span className="tabular-nums">{formatCurrency(change)}</span>
          </div>
        )}
      </div>

      {order?.completedAt && (
        <p className="text-xs text-center text-muted-foreground">
          {formatDate(order.completedAt)}
        </p>
      )}

      {/* Email receipt */}
      {state.orderId && (
        <div className="border rounded-md p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Email receipt</p>
          {emailSent ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Sent to {emailMutation.variables}
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="email"
                className="h-8 text-sm"
                placeholder={customerEmail ?? 'customer@example.com'}
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                disabled={emailMutation.isPending || (!emailInput && !customerEmail)}
                onClick={() => emailMutation.mutate(emailInput || customerEmail!)}
              >
                <Mail className="h-3.5 w-3.5" />
                {emailMutation.isPending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          )}
          {emailMutation.isError && (
            <p className="text-xs text-destructive">
              {emailMutation.error instanceof Error ? emailMutation.error.message : 'Failed to send'}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex items-center gap-2" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button className="flex-1" onClick={() => onAdvance()}>
          New Order
        </Button>
      </div>
    </div>
  );
}
