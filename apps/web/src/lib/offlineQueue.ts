const DB_NAME = 'pos_offline';
const DB_VERSION = 1;
const STORE = 'pending_orders';

export interface PendingOrderPayload {
  locationId: string;
  sessionId?: string;
  customerId?: string;
  notes?: string;
  promotionIds: string[];
  items: Array<{
    productId?: string;
    variantId?: string;
    name: string;
    price: number;
    quantity: number;
    discount: number;
  }>;
  payments: Array<{ method: string; amount: number; reference?: string }>;
}

export interface PendingOrder {
  localId: string;
  queuedAt: string;
  payload: PendingOrderPayload;
  retries: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'localId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOrder(payload: PendingOrderPayload): Promise<string> {
  const db = await openDB();
  try {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: PendingOrder = { localId, queuedAt: new Date().toISOString(), payload, retries: 0 };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return localId;
  } finally {
    db.close();
  }
}

export async function listPending(): Promise<PendingOrder[]> {
  const db = await openDB();
  try {
    return await new Promise<PendingOrder[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as PendingOrder[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function removePending(localId: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(localId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function syncPending(
  submitFn: (payload: PendingOrderPayload) => Promise<string>,
): Promise<{ synced: number; failed: number }> {
  const pending = await listPending();
  let synced = 0;
  let failed = 0;
  for (const item of pending) {
    try {
      await submitFn(item.payload);
      await removePending(item.localId);
      synced++;
    } catch {
      failed++;
    }
  }
  return { synced, failed };
}
