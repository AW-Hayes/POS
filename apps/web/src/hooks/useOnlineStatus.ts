import { useState, useEffect } from 'react';
import { listPending } from '@/lib/offlineQueue';

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Poll pending count every 5s
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const items = await listPending().catch(() => []);
      if (active) setPendingCount(items.length);
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return { online, pendingCount };
}
