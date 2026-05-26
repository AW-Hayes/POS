import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { BarChart3, TrendingUp, Package, CreditCard, Users, Printer, Clock } from 'lucide-react';

interface SalesReport {
  orderCount: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  averageOrderValue: number;
  paymentBreakdown: Record<string, number>;
  topProducts: Array<{ productId: string; name: string; quantitySold: number; revenue: number }>;
}

interface SalespersonRow {
  salesperson: { id: string; name: string };
  orderCount: number;
  totalRevenue: number;
}

interface XTapeData {
  type: 'X';
  date: string;
  orderCount: number;
  totalRevenue: number;
  paymentBreakdown: Record<string, number>;
  cashInDrawer: number;
  cashDrops: number;
}

interface ZTapeData extends Omit<XTapeData, 'type'> {
  type: 'Z';
  openingCash: number;
  expectedCash: number;
  session: { id: string; closedAt: string | null };
}

type ReportTab = 'sales' | 'salesperson' | 'x-tape' | 'z-tape';

export function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<ReportTab>('sales');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState({ from, to });
  const [sessionId, setSessionId] = useState('');
  const [xDate, setXDate] = useState(today);
  const [xResult, setXResult] = useState<XTapeData | null>(null);
  const [zResult, setZResult] = useState<ZTapeData | null>(null);

  const salesQuery = useQuery({
    queryKey: ['reports-sales', query],
    enabled: tab === 'sales',
    queryFn: () =>
      api
        .get('/reports/sales', { params: { from: `${query.from}T00:00:00.000Z`, to: `${query.to}T23:59:59.999Z` } })
        .then((r) => r.data.data as SalesReport),
  });

  const salespersonQuery = useQuery({
    queryKey: ['reports-salesperson', query],
    enabled: tab === 'salesperson',
    queryFn: () =>
      api
        .get('/reports/salesperson', { params: { from: `${query.from}T00:00:00.000Z`, to: `${query.to}T23:59:59.999Z` } })
        .then((r) => r.data.data as SalespersonRow[]),
  });

  const xMutation = useMutation({
    mutationFn: () =>
      api.get('/reports/x-tape', {
        params: {
          date: xDate,
          ...(sessionId ? { sessionId } : {}),
        },
      }).then((r) => r.data.data as XTapeData),
    onSuccess: (d) => setXResult(d),
  });

  const zMutation = useMutation({
    mutationFn: () =>
      api.post('/reports/z-tape', { sessionId }).then((r) => r.data.data as ZTapeData),
    onSuccess: (d) => setZResult(d),
  });

  const data = salesQuery.data;
  const isLoading = salesQuery.isLoading;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="flex gap-2">
        {([
          { id: 'sales', label: 'Sales', icon: TrendingUp },
          { id: 'salesperson', label: 'Salesperson', icon: Users },
          { id: 'x-tape', label: 'X-Tape', icon: Clock },
          { id: 'z-tape', label: 'Z-Tape', icon: Printer },
        ] as const).map(({ id, label, icon: Icon }) => (
          <Button key={id} size="sm" variant={tab === id ? 'default' : 'outline'} onClick={() => setTab(id)}>
            <Icon className="h-4 w-4 mr-1" />{label}
          </Button>
        ))}
      </div>

      {/* Date range (shared by sales + salesperson) */}
      {(tab === 'sales' || tab === 'salesperson') && (
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
      )}

      {/* Sales tab */}
      {tab === 'sales' && (
        isLoading ? <p className="text-muted-foreground">Loading…</p> : data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="Revenue" value={formatCurrency(data.totalRevenue)} />
              <KpiCard icon={<BarChart3 className="h-5 w-5 text-primary" />} label="Orders" value={String(data.orderCount)} />
              <KpiCard icon={<CreditCard className="h-5 w-5 text-primary" />} label="Avg Order" value={formatCurrency(data.averageOrderValue)} />
              <KpiCard icon={<Package className="h-5 w-5 text-primary" />} label="Discounts" value={formatCurrency(data.totalDiscount)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        ) : null
      )}

      {/* Salesperson tab */}
      {tab === 'salesperson' && (
        salespersonQuery.isLoading ? <p className="text-muted-foreground">Loading…</p> :
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Salesperson</th>
                <th className="text-right p-3 font-medium">Orders</th>
                <th className="text-right p-3 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(salespersonQuery.data ?? []).map((row) => (
                <tr key={row.salesperson.id}>
                  <td className="p-3 font-medium">{row.salesperson.name}</td>
                  <td className="p-3 text-right">{row.orderCount}</td>
                  <td className="p-3 text-right font-semibold">{formatCurrency(row.totalRevenue)}</td>
                </tr>
              ))}
              {(salespersonQuery.data ?? []).length === 0 && (
                <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">No attributed sales in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* X-Tape tab */}
      {tab === 'x-tape' && (
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-muted-foreground">Read the current drawer totals without closing the session.</p>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Date</label>
              <Input type="date" value={xDate} onChange={(e) => setXDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Session ID (optional)</label>
              <Input placeholder="session id…" value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-56" />
            </div>
            <Button onClick={() => xMutation.mutate()} disabled={xMutation.isPending}>Print X</Button>
          </div>

          {xResult && <TapeResult data={xResult} />}
        </div>
      )}

      {/* Z-Tape tab */}
      {tab === 'z-tape' && (
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-muted-foreground">Close a register session and print the final Z report.</p>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Session ID</label>
              <Input placeholder="session id…" value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-64" />
            </div>
            <Button
              variant="destructive"
              onClick={() => zMutation.mutate()}
              disabled={!sessionId || zMutation.isPending}
            >
              Close & Print Z
            </Button>
          </div>

          {zMutation.error && (
            <p className="text-sm text-destructive">{(zMutation.error as Error).message}</p>
          )}
          {zResult && (
            <div className="space-y-3">
              <Badge variant="success">Session Closed</Badge>
              <TapeResult data={zResult} />
              {'openingCash' in zResult && (
                <div className="border rounded-lg p-4 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Opening Cash</span>
                    <span>{formatCurrency(zResult.openingCash)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-2">
                    <span>Expected Cash in Drawer</span>
                    <span>{formatCurrency(zResult.expectedCash)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TapeResult({ data }: { data: XTapeData | ZTapeData }) {
  return (
    <div className="border rounded-lg p-4 space-y-3 text-sm">
      <div className="flex justify-between font-semibold">
        <span>{data.type}-Report — {data.date}</span>
        <span>{data.orderCount} orders</span>
      </div>
      <div className="flex justify-between border-t pt-2 font-semibold">
        <span>Total Revenue</span>
        <span>{formatCurrency(data.totalRevenue)}</span>
      </div>
      {Object.entries(data.paymentBreakdown).map(([method, amount]) => (
        <div key={method} className="flex justify-between text-muted-foreground pl-4">
          <span className="capitalize">{method.replace('_', ' ')}</span>
          <span>{formatCurrency(amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t pt-2">
        <span className="text-muted-foreground">Cash Drops</span>
        <span>-{formatCurrency(data.cashDrops)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>Net Cash in Drawer</span>
        <span>{formatCurrency(data.cashInDrawer)}</span>
      </div>
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
