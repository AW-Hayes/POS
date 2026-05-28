import { useEffect, useState } from 'react';
import { ShoppingCart, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface CartItem {
  name: string;
  quantity: number;
  price: number;
  discount: number;
}

type DisplayState =
  | { type: 'idle' }
  | { type: 'cart'; items: CartItem[]; subtotal: number }
  | { type: 'checkout'; total: number }
  | { type: 'complete'; total: number };

export function CustomerDisplayPage() {
  const [display, setDisplay] = useState<DisplayState>({ type: 'idle' });
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    // Read store name from title passed as URL param or fallback
    const params = new URLSearchParams(window.location.search);
    setStoreName(params.get('store') ?? 'RetailOS');

    const channel = new BroadcastChannel('pos-display');
    channel.onmessage = (e: MessageEvent<DisplayState>) => {
      setDisplay(e.data);
      // Auto-reset to idle 4s after order complete
      if (e.data.type === 'complete') {
        setTimeout(() => setDisplay({ type: 'idle' }), 4000);
      }
    };
    return () => channel.close();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="px-8 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center gap-3">
        <div className="rounded-full bg-primary p-2">
          <ShoppingCart className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold">{storeName}</span>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {display.type === 'idle' && (
          <div className="text-center space-y-4">
            <div className="rounded-full bg-zinc-800 p-8 mx-auto w-fit">
              <ShoppingCart className="h-16 w-16 text-zinc-500" />
            </div>
            <p className="text-2xl font-light text-zinc-400">Welcome!</p>
            <p className="text-zinc-600">Waiting for transaction…</p>
          </div>
        )}

        {(display.type === 'cart' || display.type === 'checkout') && (
          <div className="w-full max-w-lg space-y-4">
            {display.type === 'cart' && display.items.length > 0 && (
              <div className="rounded-xl bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
                {display.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.quantity > 1 && (
                        <p className="text-sm text-zinc-500">
                          {formatCurrency(item.price - item.discount)} × {item.quantity}
                        </p>
                      )}
                    </div>
                    <span className="tabular-nums font-semibold text-lg">
                      {formatCurrency((item.price - item.discount) * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl bg-primary px-8 py-6 flex justify-between items-center">
              <span className="text-xl font-light">
                {display.type === 'checkout' ? 'Total' : 'Subtotal'}
              </span>
              <span className="text-4xl font-bold tabular-nums">
                {formatCurrency(display.type === 'checkout' ? display.total : display.subtotal)}
              </span>
            </div>
          </div>
        )}

        {display.type === 'complete' && (
          <div className="text-center space-y-6">
            <div className="rounded-full bg-green-900/40 p-8 mx-auto w-fit">
              <CheckCircle2 className="h-20 w-20 text-green-400" />
            </div>
            <div>
              <p className="text-4xl font-bold text-green-400">{formatCurrency(display.total)}</p>
              <p className="text-2xl font-light text-zinc-300 mt-2">Thank you!</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-8 py-3 text-center text-xs text-zinc-700 border-t border-zinc-800">
        {storeName}
      </footer>
    </div>
  );
}
