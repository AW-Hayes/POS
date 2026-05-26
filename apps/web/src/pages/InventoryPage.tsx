import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, AlertTriangle } from 'lucide-react';
import type { InventoryWithProduct } from '@pos/types';

export function InventoryPage() {
  const [showLowStock, setShowLowStock] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', showLowStock],
    queryFn: () =>
      api.get('/inventory', { params: { lowStock: showLowStock || undefined, pageSize: 100 } }).then((r) => r.data),
  });

  const items: InventoryWithProduct[] = (data?.data ?? []).filter((item: InventoryWithProduct) =>
    search ? item.product.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <Button
          variant={showLowStock ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => setShowLowStock((v) => !v)}
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          {showLowStock ? 'Showing low stock' : 'Show low stock'}
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Filter by product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-left p-3 font-medium">Variant</th>
                <th className="text-left p-3 font-medium">SKU</th>
                <th className="text-right p-3 font-medium">Qty</th>
                <th className="text-right p-3 font-medium">Low Stock At</th>
                <th className="text-center p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => {
                const isLow = item.lowStockAt != null && item.quantity <= item.lowStockAt;
                const variantLabel = item.variant?.attributeValues
                  .map((v) => v.value)
                  .join(' / ');
                return (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{item.product.name}</td>
                    <td className="p-3 text-muted-foreground">{variantLabel ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">
                      {item.variant?.sku ?? item.product.sku ?? '—'}
                    </td>
                    <td className={`p-3 text-right font-semibold ${isLow ? 'text-destructive' : ''}`}>
                      {item.quantity}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {item.lowStockAt ?? '—'}
                    </td>
                    <td className="p-3 text-center">
                      {isLow ? (
                        <Badge variant="destructive">Low Stock</Badge>
                      ) : (
                        <Badge variant="success">In Stock</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No inventory records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
