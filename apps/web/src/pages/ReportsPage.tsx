import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { BarChart3, TrendingUp, Package, CreditCard } from 'lucide-react';

interface SalesReport {
  orderCount: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  averageOrderValue: number;
  paymentBreakdown: Record<string, number>;
  topProducts: Array<{ productId: string; name: string; quantitySold: number; revenue: number }>;
}

export function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState({ from, to });

  const { data, isLoading } = useQuery({
    queryKey: ['reports-sales', query],
    queryFn: () =>
      api
        .get('/reports/sales', { params: { from: `${query.from}T00:00:00.000Z`, to: `${query.to}T23:59:59.999Z` } })
        .then((r) => r.data.data as SalesReport),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
      </div>

      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Button onClick={() => setQuery({ from, to })}>Run Report</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : data ? (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="Revenue" value={formatCurrency(data.totalRevenue)} />
            <KpiCard icon={<BarChart3 className="h-5 w-5 text-primary" />} label="Orders" value={String(data.orderCount)} />
            <KpiCard icon={<CreditCard className="h-5 w-5 text-primary" />} label="Avg Order" value={formatCurrency(data.averageOrderValue)} />
            <KpiCard icon={<Package className="h-5 w-5 text-primary" />} label="Discounts" value={formatCurrency(data.totalDiscount)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payment breakdown */}
            <div className="border rounded-lg p-4 space-y-3">
              <h2 className="font-semibold">Payment Methods</h2>
              {Object.entries(data.paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{method.replace('_', ' ')}</span>
                  <span className="font-medium">{formatCurrency(amount)}</span>
                </div>
              ))}
              {Object.keys(data.paymentBreakdown).length === 0 && (
                <p className="text-sm text-muted-foreground">No payments</p>
              )}
            </div>

            {/* Top products */}
            <div className="border rounded-lg p-4 space-y-3">
              <h2 className="font-semibold">Top Products</h2>
              {data.topProducts.map((p, i) => (
                <div key={p.productId ?? i} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.quantitySold} sold</p>
                  </div>
                  <span className="font-medium">{formatCurrency(p.revenue)}</span>
                </div>
              ))}
              {data.topProducts.length === 0 && (
                <p className="text-sm text-muted-foreground">No sales data</p>
              )}
            </div>
          </div>

          {/* Tax summary */}
          <div className="border rounded-lg p-4 text-sm space-y-2">
            <h2 className="font-semibold">Tax Summary</h2>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal (pre-tax)</span>
              <span>{formatCurrency(data.totalRevenue - data.totalTax)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax collected</span>
              <span>{formatCurrency(data.totalTax)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>Total Revenue</span>
              <span>{formatCurrency(data.totalRevenue)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border rounded-lg p-4 flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}
