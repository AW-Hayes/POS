import { WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { syncPending, type PendingOrderPayload } from '@/lib/offlineQueue';
import { api } from '@/lib/api';

interface Props {
  online: boolean;
  pendingCount: number;
  onSynced?: () => void;
}

export function OfflineIndicator({ online, pendingCount, onSynced }: Props) {
  if (online && pendingCount === 0) return null;

  async function handleSync() {
    await syncPending(async (payload: PendingOrderPayload) => {
      const { data: orderRes } = await api.post('/orders', {
        locationId: payload.locationId,
        sessionId: payload.sessionId,
        customerId: payload.customerId,
        notes: payload.notes,
        promotionIds: payload.promotionIds,
        items: payload.items,
      });
      const orderId: string = orderRes.data.id;
      await api.post(`/orders/${orderId}/complete`, { payments: payload.payments });
      return orderId;
    });
    onSynced?.();
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium',
        online ? 'bg-amber-500/20 text-amber-400' : 'bg-destructive/20 text-destructive',
      )}
    >
      <WifiOff className="h-3 w-3" />
      {online ? (
        <button
          onClick={handleSync}
          className="flex items-center gap-1 hover:underline"
          title="Sync pending orders"
        >
          <RefreshCw className="h-3 w-3" />
          {pendingCount} pending
        </button>
      ) : (
        <span>Offline{pendingCount > 0 ? ` · ${pendingCount} queued` : ''}</span>
      )}
    </div>
  );
}
