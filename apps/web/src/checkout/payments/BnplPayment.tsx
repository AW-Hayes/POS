import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { Loader2, CheckCircle2, AlertCircle, Smartphone, QrCode } from 'lucide-react';
import type { PaymentStepProps } from '../types';

type BnplStatus = 'idle' | 'creating' | 'waiting' | 'capturing' | 'approved' | 'error';

const POLL_MS = 3000;

export function BnplPayment({ amountDue, onCollected, onCancel }: PaymentStepProps) {
  const [status, setStatus] = useState<BnplStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  async function startCheckout() {
    setStatus('creating');
    setErrorMsg(null);
    try {
      const res = await api.post('/payments/afterpay/create-checkout', { amount: amountDue });
      const { token, redirectUrl: url } = res.data.data as { token: string; redirectUrl: string };
      tokenRef.current = token;
      setRedirectUrl(url);

      // Generate QR code using qrcode library (loaded dynamically to keep bundle small)
      try {
        const QRCode = (await import('qrcode')).default;
        const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 });
        setQrDataUrl(dataUrl);
      } catch {
        // QR generation is best-effort
      }

      setStatus('waiting');
      pollStatus(token);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create Afterpay checkout');
    }
  }

  function pollStatus(token: string) {
    pollRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/payments/afterpay/checkout/${token}`);
        const { status: apStatus } = res.data.data as { status: string };

        if (apStatus === 'SUCCESS') {
          await capturePayment(token);
        } else if (apStatus === 'CANCELLED' || apStatus === 'EXPIRED') {
          setStatus('error');
          setErrorMsg(`Afterpay checkout ${apStatus.toLowerCase()}`);
        } else {
          // PENDING — keep polling
          pollStatus(token);
        }
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Polling error');
      }
    }, POLL_MS);
  }

  async function capturePayment(token: string) {
    setStatus('capturing');
    try {
      const res = await api.post(`/payments/afterpay/capture/${token}`, { amount: amountDue });
      const { paymentId } = res.data.data as { paymentId: string };
      setStatus('approved');
      setTimeout(() => {
        onCollected({ method: 'afterpay', amount: amountDue, reference: paymentId });
      }, 800);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Capture failed');
    }
  }

  function reset() {
    if (pollRef.current) clearTimeout(pollRef.current);
    tokenRef.current = null;
    setRedirectUrl(null);
    setQrDataUrl(null);
    setStatus('idle');
    setErrorMsg(null);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Pay with Afterpay / Clearpay</p>
        <p className="text-4xl font-bold tabular-nums">{formatCurrency(amountDue)}</p>
        <p className="text-xs text-muted-foreground mt-1">Buy now, pay later in 4 installments</p>
      </div>

      <div className="rounded-lg border-2 border-dashed p-6 flex flex-col items-center gap-3 text-muted-foreground min-h-[160px] justify-center">
        {status === 'idle' && (
          <>
            <Smartphone className="h-10 w-10" />
            <p className="text-sm text-center">Customer scans QR code or taps the link on their phone</p>
          </>
        )}

        {status === 'creating' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-sm">Creating Afterpay checkout…</p>
          </>
        )}

        {status === 'waiting' && (
          <div className="flex flex-col items-center gap-3 w-full">
            {qrDataUrl ? (
              <>
                <p className="text-xs font-medium text-primary">Scan with Afterpay app</p>
                <img src={qrDataUrl} alt="Afterpay QR code" className="rounded-lg border border-border" width={160} height={160} />
              </>
            ) : (
              <>
                <QrCode className="h-10 w-10 text-primary" />
                <p className="text-sm font-medium text-primary">Waiting for customer…</p>
              </>
            )}
            {redirectUrl && (
              <a
                href={redirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline underline-offset-2"
              >
                Open on this device
              </a>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Waiting for approval…
            </div>
          </div>
        )}

        {status === 'capturing' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium">Capturing payment…</p>
          </>
        )}

        {status === 'approved' && (
          <>
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-600">Approved!</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <p className="text-sm font-medium text-destructive">{errorMsg ?? 'Error'}</p>
          </>
        )}
      </div>

      <div className="space-y-2">
        {status === 'idle' && (
          <Button className="w-full" onClick={startCheckout}>
            Start Afterpay Checkout
          </Button>
        )}

        {status === 'error' && (
          <Button className="w-full" onClick={reset}>
            Try Again
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => { reset(); onCancel(); }}
          disabled={status === 'capturing' || status === 'approved'}
        >
          Back
        </Button>
      </div>
    </div>
  );
}
