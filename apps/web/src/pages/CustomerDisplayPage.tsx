import { useEffect, useState } from 'react';
import { ShoppingCart, CheckCircle2, CreditCard, Banknote, Smartphone } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface CartItem {
  name: string;
  quantity: number;
  price: number;
  discount: number;
}

interface PaymentEntry {
  method: string;
  amount: number;
}

type DisplayState =
  | { type: 'idle' }
  | { type: 'cart'; items: CartItem[]; subtotal: number; taxAmount?: number }
  | { type: 'checkout'; total: number; taxAmount?: number; tipAmount?: number }
  | { type: 'complete'; total: number; change?: number; payments?: PaymentEntry[] };

function PaymentMethodIcon({ method }: { method: string }) {
  const m = method.toLowerCase();
  if (m === 'cash') return <Banknote className="h-4 w-4" />;
  if (m.includes('phone') || m.includes('tap') || m === 'nfc') return <Smartphone className="h-4 w-4" />;
  return <CreditCard className="h-4 w-4" />;
}

export function CustomerDisplayPage() {
  const [display, setDisplay] = useState<DisplayState>({ type: 'idle' });
  const [storeName, setStoreName] = useState('');
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStoreName(params.get('store') ?? 'RetailOS');

    const channel = new BroadcastChannel('pos-display');
    channel.onmessage = (e: MessageEvent<DisplayState>) => {
      setDisplay(e.data);
      setAnimKey((k) => k + 1);
      if (e.data.type === 'complete') {
        setTimeout(() => setDisplay({ type: 'idle' }), 6000);
      }
    };
    return () => channel.close();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="px-8 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center gap-3">
        <div className="rounded-full bg-amber-500 p-2">
          <ShoppingCart className="h-5 w-5 text-black" />
        </div>
        <span className="text-lg font-semibold tracking-tight">{storeName}</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-8" key={animKey}>
        {display.type === 'idle' && (
          <div className="text-center space-y-6 animate-in fade-in duration-500">
            <div className="rounded-full bg-zinc-800 p-10 mx-auto w-fit">
              <ShoppingCart className="h-20 w-20 text-zinc-600" />
            </div>
            <div>
              <p className="text-3xl font-light text-zinc-300">Welcome!</p>
              <p className="text-zinc-600 mt-2 text-lg">Your items will appear here</p>
            </div>
          </div>
        )}

        {display.type === 'cart' && (
          <div className="w-full max-w-xl space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {display.items.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
                {display.items.map((item, i) => {
                  const linePrice = item.price - item.discount;
                  const lineTotal = linePrice * item.quantity;
                  return (
                    <div key={i} className="flex items-center justify-between px-6 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.quantity > 1 && (
                            <p className="text-sm text-zinc-500">
                              {formatCurrency(linePrice)} × {item.quantity}
                            </p>
                          )}
                          {item.discount > 0 && (
                            <span className="text-xs bg-green-900/50 text-green-400 rounded px-1.5 py-0.5">
                              -{formatCurrency(item.discount * item.quantity)} off
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="tabular-nums font-semibold text-xl ml-4">
                        {formatCurrency(lineTotal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-2xl bg-zinc-900 divide-y divide-zinc-800 overflow-hidden">
              <div className="flex justify-between items-center px-6 py-3 text-zinc-400">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(display.subtotal)}</span>
              </div>
              {display.taxAmount != null && display.taxAmount > 0 && (
                <div className="flex justify-between items-center px-6 py-3 text-zinc-400">
                  <span>Tax</span>
                  <span className="tabular-nums">{formatCurrency(display.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center px-6 py-4 text-white">
                <span className="text-xl font-medium">Total</span>
                <span className="tabular-nums text-3xl font-bold">
                  {formatCurrency(display.subtotal + (display.taxAmount ?? 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {display.type === 'checkout' && (
          <div className="w-full max-w-xl space-y-3 animate-in fade-in duration-300">
            <div className="rounded-2xl bg-zinc-900 divide-y divide-zinc-800 overflow-hidden">
              {display.taxAmount != null && display.taxAmount > 0 && (
                <div className="flex justify-between items-center px-6 py-3 text-zinc-400">
                  <span>Tax</span>
                  <span className="tabular-nums">{formatCurrency(display.taxAmount)}</span>
                </div>
              )}
              {display.tipAmount != null && display.tipAmount > 0 && (
                <div className="flex justify-between items-center px-6 py-3 text-zinc-400">
                  <span>Tip</span>
                  <span className="tabular-nums">{formatCurrency(display.tipAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center px-6 py-5">
                <span className="text-2xl font-light">Total Due</span>
                <span className="tabular-nums text-5xl font-bold text-amber-400">
                  {formatCurrency(display.total)}
                </span>
              </div>
            </div>
            <p className="text-center text-zinc-600 text-sm">Please follow the payment terminal</p>
          </div>
        )}

        {display.type === 'complete' && (
          <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="rounded-full bg-green-900/30 border border-green-700/30 p-10 mx-auto w-fit">
              <CheckCircle2 className="h-24 w-24 text-green-400" />
            </div>
            <div className="space-y-2">
              <p className="text-5xl font-bold text-white tabular-nums">{formatCurrency(display.total)}</p>
              <p className="text-3xl font-light text-green-400">Thank you!</p>
              {display.change != null && display.change > 0 && (
                <p className="text-2xl text-zinc-300 mt-4">
                  Change: <span className="font-semibold tabular-nums">{formatCurrency(display.change)}</span>
                </p>
              )}
            </div>
            {display.payments && display.payments.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {display.payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 bg-zinc-800 rounded-full px-4 py-2 text-sm text-zinc-300">
                    <PaymentMethodIcon method={p.method} />
                    <span className="capitalize">{p.method}</span>
                    <span className="tabular-nums text-zinc-400">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="px-8 py-3 text-center text-xs text-zinc-700 border-t border-zinc-800">
        {storeName} &nbsp;·&nbsp; Powered by RetailOS
      </footer>
    </div>
  );
}
