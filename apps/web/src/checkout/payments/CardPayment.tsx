import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, Loader2, CheckCircle2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import type { PaymentStepProps } from '../types';
import type { PaymentTerminalConfig } from '@pos/types';

type TerminalStatus = 'idle' | 'connecting' | 'waiting' | 'processing' | 'approved' | 'declined' | 'error';

/**
 * Card payment component. Reads the tenant's paymentTerminal config to determine
 * the active provider and environment. Supports:
 *
 *   provider: 'none'   — manual / offline stub (sim button visible)
 *   provider: 'stripe' — Stripe Terminal SDK integration point
 *   provider: 'square' — Square Terminal SDK integration point
 *
 * In sandbox/dev environments the simulate button is always available.
 * Replace the provider-specific blocks with real SDK calls to go live.
 */
export function CardPayment({ amountDue, onCollected, onCancel }: PaymentStepProps) {
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: tenantData } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.get('/tenants/me').then((r) => r.data.data),
  });

  const terminalConfig: PaymentTerminalConfig = tenantData?.settings?.paymentTerminal ?? {
    provider: 'none',
    environment: 'sandbox',
  };

  const isSandbox = terminalConfig.environment === 'sandbox';
  const providerLabel = terminalConfig.provider === 'stripe'
    ? 'Stripe Terminal'
    : terminalConfig.provider === 'square'
    ? 'Square Terminal'
    : 'Manual';

  // Auto-connect for real terminal providers
  useEffect(() => {
    if (terminalConfig.provider === 'none') return;

    setStatus('connecting');
    // ── Stripe Terminal connection point ────────────────────────────────────
    // import { loadStripeTerminal } from '@stripe/terminal-js';
    // const terminal = await loadStripeTerminal();
    // await terminal.connectReader({ readerId: terminalConfig.readerIds?.[0] });
    // setStatus('waiting');
    //
    // ── Square Terminal connection point ────────────────────────────────────
    // const payment = await squareClient.terminalApi.createTerminalCheckout({ ... });
    // setStatus('waiting');

    // Placeholder — remove when real SDK is wired in:
    setTimeout(() => setStatus('waiting'), 800);
  }, [terminalConfig.provider]);

  async function presentToTerminal() {
    setStatus('processing');
    setErrorMsg(null);

    try {
      if (terminalConfig.provider === 'stripe') {
        // ── Stripe Terminal payment collection ─────────────────────────────
        // const result = await terminal.collectPaymentMethod(paymentIntentClientSecret);
        // if (result.error) throw new Error(result.error.message);
        // await terminal.processPayment(result.paymentIntent);
        // onCollected({ method: 'card', amount: amountDue, reference: result.paymentIntent.id });
        throw new Error('Wire in Stripe Terminal SDK to go live (see CardPayment.tsx)');
      } else if (terminalConfig.provider === 'square') {
        // ── Square Terminal payment collection ─────────────────────────────
        // const { result } = await squareClient.terminalApi.getTerminalCheckout(checkoutId);
        // onCollected({ method: 'card', amount: amountDue, reference: result.checkout?.id });
        throw new Error('Wire in Square Terminal SDK to go live (see CardPayment.tsx)');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Terminal error');
    }
  }

  function simulateApproval() {
    setStatus('processing');
    setTimeout(() => {
      setStatus('approved');
      setTimeout(() => {
        onCollected({ method: 'card', amount: amountDue, reference: `SIM-${Date.now()}` });
      }, 600);
    }, 1200);
  }

  function simulateDecline() {
    setStatus('processing');
    setTimeout(() => {
      setStatus('declined');
      setErrorMsg('Card declined (simulated)');
      setTimeout(() => { setStatus('idle'); setErrorMsg(null); }, 2000);
    }, 1200);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Charge to card</p>
        <p className="text-4xl font-bold tabular-nums">{formatCurrency(amountDue)}</p>
      </div>

      {/* Provider + environment badge */}
      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="text-muted-foreground">{providerLabel}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isSandbox ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
          {isSandbox ? 'Sandbox' : 'Production'}
        </span>
      </div>

      {/* Terminal status display */}
      <div className="rounded-lg border-2 border-dashed p-8 flex flex-col items-center gap-3 text-muted-foreground">
        {status === 'idle' && <><CreditCard className="h-10 w-10" /><p className="text-sm text-center">Ready to accept card payment</p></>}
        {status === 'connecting' && <><Loader2 className="h-10 w-10 animate-spin" /><p className="text-sm">Connecting to {providerLabel}…</p></>}
        {status === 'waiting' && (
          <>
            <div className="relative">
              <CreditCard className="h-10 w-10 text-primary" />
              <Wifi className="absolute -top-1 -right-2 h-4 w-4 text-primary animate-pulse" />
            </div>
            <p className="text-sm font-medium text-primary">Present card to terminal</p>
          </>
        )}
        {status === 'processing' && <><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-sm font-medium">Processing…</p></>}
        {status === 'approved' && (
          <>
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-600">Approved</p>
          </>
        )}
        {(status === 'declined' || status === 'error') && (
          <>
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <p className="text-sm font-medium text-destructive">{errorMsg ?? 'Error'}</p>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="space-y-2">
        {terminalConfig.provider !== 'none' && status === 'waiting' && (
          <Button className="w-full" onClick={presentToTerminal}>
            Collect Payment
          </Button>
        )}

        {(isSandbox || terminalConfig.provider === 'none') && status === 'idle' && (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={simulateApproval}>
              Simulate Approval
            </Button>
            <Button variant="outline" onClick={simulateDecline}>
              Decline
            </Button>
          </div>
        )}

        {(status === 'declined' || status === 'error') && (
          <Button variant="outline" className="w-full" onClick={() => { setStatus(terminalConfig.provider === 'none' ? 'idle' : 'waiting'); setErrorMsg(null); }}>
            Try Again
          </Button>
        )}

        <Button variant="outline" className="w-full" onClick={onCancel} disabled={status === 'processing' || status === 'approved'}>
          Back
        </Button>
      </div>
    </div>
  );
}
