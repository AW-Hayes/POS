import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, Loader2, CheckCircle2, AlertCircle, Wifi } from 'lucide-react';
import type { PaymentStepProps } from '../types';
import type { PaymentTerminalConfig } from '@pos/types';

type TerminalStatus = 'idle' | 'connecting' | 'waiting' | 'processing' | 'approved' | 'declined' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeTerminalInstance = any;

export function CardPayment({ amountDue, onCollected, onCancel }: PaymentStepProps) {
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const terminalRef = useRef<StripeTerminalInstance>(null);

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

  // Auto-connect for Stripe Terminal
  useEffect(() => {
    if (terminalConfig.provider !== 'stripe') return;

    let cancelled = false;
    setStatus('connecting');

    (async () => {
      try {
        const { loadStripeTerminal } = await import('@stripe/terminal-js');
        const StripeTerminal = (await loadStripeTerminal())!;

        const terminal = StripeTerminal.create({
          onFetchConnectionToken: async () => {
            const res = await api.post('/payments/stripe/connection-token');
            return res.data.data.secret as string;
          },
          onUnexpectedReaderDisconnect: () => {
            if (!cancelled) { setStatus('error'); setErrorMsg('Reader disconnected unexpectedly.'); }
          },
        });

        if (cancelled) return;
        terminalRef.current = terminal;

        const discoverResult = await terminal.discoverReaders({
          simulated: isSandbox,
          ...(terminalConfig.locationId ? { location: terminalConfig.locationId } : {}),
        });

        if ('error' in discoverResult) throw new Error(discoverResult.error.message);
        if (discoverResult.discoveredReaders.length === 0) throw new Error('No readers found. Check that a reader is online and assigned to this location.');

        const reader = discoverResult.discoveredReaders[0];
        const connectResult = await terminal.connectReader(reader);
        if ('error' in connectResult) throw new Error(connectResult.error.message);

        if (!cancelled) setStatus('waiting');
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err instanceof Error ? err.message : 'Failed to connect to reader');
        }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalConfig.provider, terminalConfig.locationId, isSandbox]);

  async function presentToTerminal() {
    const terminal = terminalRef.current;
    if (!terminal) { setStatus('error'); setErrorMsg('Terminal not connected'); return; }

    setStatus('processing');
    setErrorMsg(null);

    try {
      // 1. Create PaymentIntent on backend
      const intentRes = await api.post('/payments/stripe/create-intent', { amount: amountDue });
      const { clientSecret } = intentRes.data.data as { clientSecret: string };

      // 2. Collect payment method on the reader
      const collectResult = await terminal.collectPaymentMethod(clientSecret);
      if ('error' in collectResult) throw new Error(collectResult.error.message);

      // 3. Process (confirm) the payment
      const processResult = await terminal.processPayment(collectResult.paymentIntent);
      if ('error' in processResult) {
        // Declined — extract decline code if available
        const code = (processResult.error as { decline_code?: string }).decline_code;
        throw new Error(code ? `Card declined: ${code}` : processResult.error.message);
      }

      setStatus('approved');
      setTimeout(() => {
        onCollected({
          method: 'card',
          amount: amountDue,
          reference: processResult.paymentIntent.id,
        });
      }, 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terminal error';
      const isDecline = msg.toLowerCase().includes('declin');
      setStatus(isDecline ? 'declined' : 'error');
      setErrorMsg(msg);
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

  const canRetry = status === 'declined' || status === 'error';
  const retryStatus: TerminalStatus = terminalConfig.provider === 'none' ? 'idle' : 'waiting';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Charge to card</p>
        <p className="text-4xl font-bold tabular-nums">{formatCurrency(amountDue)}</p>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="text-muted-foreground">{providerLabel}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isSandbox ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
          {isSandbox ? 'Sandbox' : 'Production'}
        </span>
      </div>

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
          <><div className="rounded-full bg-green-100 p-3"><CheckCircle2 className="h-8 w-8 text-green-600" /></div><p className="text-sm font-medium text-green-600">Approved</p></>
        )}
        {(status === 'declined' || status === 'error') && (
          <><div className="rounded-full bg-destructive/10 p-3"><AlertCircle className="h-8 w-8 text-destructive" /></div><p className="text-sm font-medium text-destructive">{errorMsg ?? 'Error'}</p></>
        )}
      </div>

      <div className="space-y-2">
        {terminalConfig.provider === 'stripe' && status === 'waiting' && (
          <Button className="w-full" onClick={presentToTerminal}>
            Collect Payment
          </Button>
        )}

        {(isSandbox || terminalConfig.provider === 'none') && (status === 'idle' || status === 'waiting') && (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={simulateApproval}>Simulate Approval</Button>
            <Button variant="outline" onClick={simulateDecline}>Decline</Button>
          </div>
        )}

        {canRetry && (
          <Button variant="outline" className="w-full" onClick={() => { setStatus(retryStatus); setErrorMsg(null); }}>
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
