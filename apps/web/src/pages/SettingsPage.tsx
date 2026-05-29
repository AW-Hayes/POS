import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTerminalStore } from '@/stores/terminal';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Monitor, Tablet, List, BookOpen, CreditCard, Save,
  Building2, PlusCircle, Pencil, Trash2,
  Star, Settings, AlertCircle, Keyboard, RotateCcw, ToggleLeft, ToggleRight,
  Printer, Wifi, WifiOff, Barcode,
} from 'lucide-react';
import { DEFAULT_HOTKEYS, loadHotkeyMap, saveHotkeyMap, resetHotkeyMap, eventToKey } from '@/lib/hotkeys';
import { FEATURE_DEFS, getFeatureFlags } from '@/lib/features';
import { loadPrinterConfig, savePrinterConfig, sendToPrinter, generateEscPos, openCashDrawer } from '@/lib/printer';
import type { PaymentTerminalConfig } from '@pos/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Location = { id: string; name: string; address?: string; phone?: string; active: boolean };
type Register = { id: string; name: string; mode: string; locationId: string; location: { id: string; name: string } };
type User = { id: string; name: string; email: string; role: string; createdAt: string };
type Tenant = { id: string; name: string; slug: string; settings: Record<string, unknown> };

// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = 'terminal' | 'general' | 'locations' | 'registers' | 'users' | 'loyalty' | 'keyboard' | 'features' | 'hardware' | 'audit' | 'integrations' | 'catalog';

const allTabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
  { id: 'terminal',     label: 'Terminal' },
  { id: 'keyboard',     label: 'Keyboard' },
  { id: 'hardware',     label: 'Hardware' },
  { id: 'general',      label: 'General',      adminOnly: true },
  { id: 'catalog',      label: 'Catalog',      adminOnly: true },
  { id: 'locations',    label: 'Locations',    adminOnly: true },
  { id: 'registers',    label: 'Registers',    adminOnly: true },
  { id: 'users',        label: 'Users',        adminOnly: true },
  { id: 'loyalty',      label: 'Loyalty',      adminOnly: true },
  { id: 'integrations', label: 'Integrations', adminOnly: true },
  { id: 'features',     label: 'Features',     adminOnly: true },
  { id: 'audit',        label: 'Audit Log',    adminOnly: true },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function useTenant() {
  return useQuery<Tenant>({
    queryKey: ['tenant', 'current'],
    queryFn: () => api.get('/tenants/current').then((r) => r.data.data),
  });
}

function SavedBadge({ saved }: { saved: boolean }) {
  if (!saved) return null;
  return <span className="text-sm text-green-600 font-medium">Saved!</span>;
}

// ─── Terminal tab (device-local settings) ────────────────────────────────────

function TerminalTab() {
  const { mode, setMode, registerId, setRegister } = useTerminalStore();
  const queryClient = useQueryClient();
  const { data: tenantData } = useTenant();

  const { data: registers } = useQuery<Register[]>({
    queryKey: ['registers'],
    queryFn: () => api.get('/registers').then((r) => r.data.data),
  });

  const existingConfig: PaymentTerminalConfig =
    (tenantData?.settings?.paymentTerminal as PaymentTerminalConfig) ?? {
      provider: 'none',
      environment: 'sandbox',
    };
  const [ptConfig, setPtConfig] = useState<PaymentTerminalConfig>(existingConfig);
  const [ptSaved, setPtSaved] = useState(false);

  const updateTenantMutation = useMutation({
    mutationFn: (settings: Record<string, unknown>) =>
      api.patch('/tenants/current', { settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'current'] });
      setPtSaved(true);
      setTimeout(() => setPtSaved(false), 2000);
    },
  });

  function saveTerminalConfig() {
    const current = tenantData?.settings ?? {};
    updateTenantMutation.mutate({ ...current, paymentTerminal: ptConfig });
  }

  const terminalModes = [
    { id: 'desktop' as const,   icon: <Monitor className="h-5 w-5" />,  label: 'Desktop' },
    { id: 'touch' as const,     icon: <Tablet className="h-5 w-5" />,   label: 'Touch' },
    { id: 'line-item' as const, icon: <List className="h-5 w-5" />,     label: 'Line Item' },
    { id: 'quickfind' as const, icon: <BookOpen className="h-5 w-5" />, label: 'QuickFind' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Terminal Mode</CardTitle>
          <CardDescription>
            Choose the interface layout for this device. Desktop/Touch use a product grid;
            Line Item uses keyboard SKU entry; QuickFind uses hierarchical category browsing.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {terminalModes.map((m) => (
            <Button
              key={m.id}
              variant={mode === m.id ? 'default' : 'outline'}
              className="h-20 flex-col gap-2"
              onClick={() => setMode(m.id)}
            >
              {m.icon}
              <span>{m.label}</span>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>
            Assign this device to a register. This determines which location's inventory is
            used and links sessions to this register.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {registers?.map((reg) => (
            <div
              key={reg.id}
              className={cn(
                'flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors',
                registerId === reg.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
              )}
              onClick={() => setRegister(reg.id, reg.locationId)}
            >
              <div>
                <p className="font-medium">{reg.name}</p>
                <p className="text-sm text-muted-foreground">{reg.location?.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{reg.mode}</Badge>
                {registerId === reg.id && <Badge variant="success">Active</Badge>}
              </div>
            </div>
          ))}
          {!registers?.length && (
            <p className="text-sm text-muted-foreground">No registers configured.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Terminal
          </CardTitle>
          <CardDescription>
            Configure the card payment provider for this tenant. Sandbox mode enables simulate
            buttons for testing without real hardware.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Provider</label>
              <Select
                value={ptConfig.provider}
                onValueChange={(v: PaymentTerminalConfig['provider']) =>
                  setPtConfig((c) => ({ ...c, provider: v }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (manual / stub)</SelectItem>
                  <SelectItem value="stripe">Stripe Terminal</SelectItem>
                  <SelectItem value="square">Square Terminal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Environment</label>
              <Select
                value={ptConfig.environment}
                onValueChange={(v: PaymentTerminalConfig['environment']) =>
                  setPtConfig((c) => ({ ...c, environment: v }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox / Test</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {ptConfig.provider !== 'none' && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {ptConfig.provider === 'stripe' ? 'Stripe Secret Key' : 'Square Access Token'}
                </label>
                <Input
                  type="password"
                  placeholder={ptConfig.provider === 'stripe' ? 'sk_test_…' : 'EAAl…'}
                  value={ptConfig.apiKey ?? ''}
                  onChange={(e) => setPtConfig((c) => ({ ...c, apiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {ptConfig.provider === 'stripe' ? 'Stripe Location ID' : 'Square Location ID'}
                </label>
                <Input
                  placeholder={ptConfig.provider === 'stripe' ? 'tml_loc_…' : 'L…'}
                  value={ptConfig.locationId ?? ''}
                  onChange={(e) => setPtConfig((c) => ({ ...c, locationId: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Reader IDs (comma-separated)</label>
                <Input
                  placeholder={ptConfig.provider === 'stripe' ? 'tmr_…' : 'DEVICE_…'}
                  value={(ptConfig.readerIds ?? []).join(', ')}
                  onChange={(e) =>
                    setPtConfig((c) => ({
                      ...c,
                      readerIds: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-3">
            <Button
              className="gap-2"
              onClick={saveTerminalConfig}
              disabled={updateTenantMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {updateTenantMutation.isPending ? 'Saving…' : 'Save Configuration'}
            </Button>
            <SavedBadge saved={ptSaved} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── General tab ─────────────────────────────────────────────────────────────

function GeneralTab() {
  const queryClient = useQueryClient();
  const { data: tenant } = useTenant();
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;

  const [name, setName] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [currency, setCurrency] = useState('');
  const [timezone, setTimezone] = useState('');
  const [discountThresholdPct, setDiscountThresholdPct] = useState('');
  const [receiptStoreName, setReceiptStoreName] = useState('');
  const [receiptAddress, setReceiptAddress] = useState('');
  const [receiptPhone, setReceiptPhone] = useState('');
  const [receiptWebsite, setReceiptWebsite] = useState('');
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [saved, setSaved] = useState(false);
  const [initialised, setInitialised] = useState(false);

  if (tenant && !initialised) {
    setName(tenant.name ?? '');
    setTaxRate(String(((settings.taxRate as number) ?? 0) * 100));
    setCurrency((settings.currency as string) ?? 'USD');
    setTimezone((settings.timezone as string) ?? 'America/New_York');
    setDiscountThresholdPct(String(settings.discountThresholdPct ?? ''));
    setReceiptStoreName((settings.receiptStoreName as string) ?? '');
    setReceiptAddress((settings.receiptAddress as string) ?? '');
    setReceiptPhone((settings.receiptPhone as string) ?? '');
    setReceiptWebsite((settings.receiptWebsite as string) ?? '');
    setReceiptHeader((settings.receiptHeader as string) ?? '');
    setReceiptFooter((settings.receiptFooter as string) ?? '');
    setInitialised(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch('/tenants/current', {
        name,
        settings: {
          ...settings,
          taxRate: Number(taxRate) / 100,
          currency,
          timezone,
          discountThresholdPct: discountThresholdPct ? Number(discountThresholdPct) : undefined,
          receiptStoreName: receiptStoreName || undefined,
          receiptAddress: receiptAddress || undefined,
          receiptPhone: receiptPhone || undefined,
          receiptWebsite: receiptWebsite || undefined,
          receiptHeader: receiptHeader || undefined,
          receiptFooter: receiptFooter || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'current'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const TIMEZONES = [
    'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
    'America/Toronto', 'America/Vancouver',
    'Europe/London', 'Europe/Paris',
    'Asia/Tokyo', 'Australia/Sydney',
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Store Settings</CardTitle>
          <CardDescription>Tenant-wide defaults applied across all locations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Store Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Store"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Default Tax Rate (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.001}
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="8.5"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Timezone</label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Discount Override Threshold (%)</label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={discountThresholdPct}
              onChange={(e) => setDiscountThresholdPct(e.target.value)}
              placeholder="e.g. 20 — require manager PIN above this %"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              className="gap-2"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            <SavedBadge saved={saved} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Receipt Customization</CardTitle>
          <CardDescription>These fields appear on printed and emailed receipts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Receipt Store Name</label>
              <Input value={receiptStoreName} onChange={(e) => setReceiptStoreName(e.target.value)} placeholder={name || 'RetailOS'} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone</label>
              <Input value={receiptPhone} onChange={(e) => setReceiptPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Address</label>
            <Input value={receiptAddress} onChange={(e) => setReceiptAddress(e.target.value)} placeholder="123 Main St, Anytown USA" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Website</label>
            <Input value={receiptWebsite} onChange={(e) => setReceiptWebsite(e.target.value)} placeholder="www.mystore.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Header Message</label>
            <Input value={receiptHeader} onChange={(e) => setReceiptHeader(e.target.value)} placeholder="Welcome! Returns within 30 days with receipt." />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Footer Message</label>
            <Input value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder="Thank you for shopping with us!" />
          </div>
          <div className="flex items-center gap-3">
            <Button className="gap-2" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save Receipt Settings'}
            </Button>
            <SavedBadge saved={saved} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Locations tab ────────────────────────────────────────────────────────────

const blankLocation = { name: '', address: '', phone: '' };

function LocationsTab() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; editing: Location | null }>({
    open: false, editing: null,
  });
  const [form, setForm] = useState(blankLocation);
  const [error, setError] = useState('');

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      dialog.editing
        ? api.patch(`/locations/${dialog.editing.id}`, form)
        : api.post('/locations', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setDialog({ open: false, editing: null });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Save failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/locations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['locations'] }),
  });

  function openNew() {
    setForm(blankLocation);
    setError('');
    setDialog({ open: true, editing: null });
  }

  function openEdit(loc: Location) {
    setForm({ name: loc.name, address: loc.address ?? '', phone: loc.phone ?? '' });
    setError('');
    setDialog({ open: true, editing: loc });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Locations</CardTitle>
            <CardDescription>Physical store locations for inventory and registers.</CardDescription>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openNew}>
            <PlusCircle className="h-4 w-4" /> Add Location
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {locations.map((loc) => (
            <div key={loc.id} className="flex items-center justify-between p-3 rounded-md border">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">{loc.name}</p>
                  {loc.address && <p className="text-sm text-muted-foreground">{loc.address}</p>}
                  {loc.phone && <p className="text-sm text-muted-foreground">{loc.phone}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => openEdit(loc)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(loc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {locations.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No locations yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit Location' : 'New Location'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Address</label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="123 Main St"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 555-5555"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog((d) => ({ ...d, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Registers tab ────────────────────────────────────────────────────────────

const blankRegister = { name: '', locationId: '', mode: 'desktop' as 'desktop' | 'touch' };

function RegistersTab() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; editing: Register | null }>({
    open: false, editing: null,
  });
  const [form, setForm] = useState(blankRegister);
  const [error, setError] = useState('');

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data.data),
  });

  const { data: registers = [] } = useQuery<Register[]>({
    queryKey: ['registers'],
    queryFn: () => api.get('/registers').then((r) => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      dialog.editing
        ? api.patch(`/registers/${dialog.editing.id}`, { name: form.name, mode: form.mode })
        : api.post('/registers', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registers'] });
      setDialog({ open: false, editing: null });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Save failed');
    },
  });

  function openNew() {
    setForm({ ...blankRegister, locationId: locations[0]?.id ?? '' });
    setError('');
    setDialog({ open: true, editing: null });
  }

  function openEdit(reg: Register) {
    setForm({ name: reg.name, locationId: reg.locationId, mode: reg.mode as 'desktop' | 'touch' });
    setError('');
    setDialog({ open: true, editing: reg });
  }

  const byLocation = locations.map((loc) => ({
    loc,
    regs: registers.filter((r) => r.locationId === loc.id),
  }));

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Registers</CardTitle>
            <CardDescription>POS terminals, organized by location.</CardDescription>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openNew} disabled={locations.length === 0}>
            <PlusCircle className="h-4 w-4" /> Add Register
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {byLocation.map(({ loc, regs }) => (
            <div key={loc.id}>
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {loc.name}
              </p>
              <div className="space-y-2">
                {regs.map((reg) => (
                  <div
                    key={reg.id}
                    className="flex items-center justify-between p-3 rounded-md border"
                  >
                    <div>
                      <p className="font-medium">{reg.name}</p>
                      <Badge variant="outline" className="text-xs mt-0.5">{reg.mode}</Badge>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(reg)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {regs.length === 0 && (
                  <p className="text-sm text-muted-foreground pl-2">No registers at this location.</p>
                )}
              </div>
            </div>
          ))}
          {locations.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Add a location first before creating registers.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit Register' : 'New Register'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Register 1"
                autoFocus
              />
            </div>
            {!dialog.editing && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Location *</label>
                <Select
                  value={form.locationId}
                  onValueChange={(v) => setForm((f) => ({ ...f, locationId: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mode</label>
              <Select
                value={form.mode}
                onValueChange={(v: 'desktop' | 'touch') => setForm((f) => ({ ...f, mode: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desktop">Desktop</SelectItem>
                  <SelectItem value="touch">Touch</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog((d) => ({ ...d, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                !form.name ||
                (!dialog.editing && !form.locationId) ||
                saveMutation.isPending
              }
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────

type UserForm = {
  name: string;
  email: string;
  password: string;
  pin: string;
  role: 'admin' | 'manager' | 'cashier';
  commissionRate: string;
};
const blankUser: UserForm = { name: '', email: '', password: '', pin: '', role: 'cashier', commissionRate: '' };

function UsersTab() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [dialog, setDialog] = useState<{ open: boolean; editing: User | null }>({
    open: false, editing: null,
  });
  const [form, setForm] = useState<UserForm>(blankUser);
  const [error, setError] = useState('');

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      dialog.editing
        ? api.patch(`/users/${dialog.editing.id}`, {
            name: form.name,
            role: form.role,
            ...(form.password ? { password: form.password } : {}),
            ...(form.pin ? { pin: form.pin } : {}),
          }).then(async (r) => {
            if (form.commissionRate !== '') {
              await api.put(`/commissions/users/${dialog.editing!.id}/rate`, {
                commissionRate: form.commissionRate ? parseFloat(form.commissionRate) : null,
              });
            }
            return r;
          })
        : api.post('/users', {
            name: form.name,
            email: form.email,
            role: form.role,
            ...(form.password ? { password: form.password } : {}),
            ...(form.pin ? { pin: form.pin } : {}),
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDialog({ open: false, editing: null });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Save failed');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  function openNew() {
    setForm(blankUser);
    setError('');
    setDialog({ open: true, editing: null });
  }

  function openEdit(u: User) {
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      pin: '',
      role: u.role as UserForm['role'],
      commissionRate: (u as User & { commissionRate?: number }).commissionRate != null
        ? String((u as User & { commissionRate?: number }).commissionRate)
        : '',
    });
    setError('');
    setDialog({ open: true, editing: u });
  }

  const roleBadge: Record<string, 'default' | 'secondary' | 'outline'> = {
    admin: 'default', manager: 'secondary', cashier: 'outline',
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>Manage staff accounts and access levels.</CardDescription>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openNew}>
            <PlusCircle className="h-4 w-4" /> Add User
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-3 rounded-md border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-sm text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={roleBadge[u.role] ?? 'outline'} className="capitalize">
                  {u.role}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {u.id !== currentUser?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deactivateMutation.mutate(u.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No users found.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit User' : 'New User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            {!dialog.editing && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email *</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role</label>
              <Select
                value={form.role}
                onValueChange={(v: UserForm['role']) => setForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {dialog.editing ? 'New Password (leave blank to keep)' : 'Password'}
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="min 8 characters"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {dialog.editing ? 'New PIN (leave blank to keep)' : 'PIN (4–6 digits)'}
              </label>
              <Input
                type="password"
                inputMode="numeric"
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                placeholder="4–6 digit PIN"
                maxLength={6}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Commission Rate (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.commissionRate}
                onChange={(e) => setForm((f) => ({ ...f, commissionRate: e.target.value }))}
                placeholder="e.g. 5 (leave blank for none)"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog((d) => ({ ...d, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                !form.name ||
                (!dialog.editing && (!form.email || (!form.password && !form.pin))) ||
                saveMutation.isPending
              }
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Loyalty tab ──────────────────────────────────────────────────────────────

function LoyaltyTab() {
  const queryClient = useQueryClient();
  const { data: tenant } = useTenant();
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const loyaltySettings = (settings.loyalty ?? {}) as Record<string, unknown>;

  const [enabled, setEnabled] = useState(false);
  const [earnRate, setEarnRate] = useState('1');
  const [redeemRate, setRedeemRate] = useState('100');
  const [saved, setSaved] = useState(false);
  const [initialised, setInitialised] = useState(false);

  if (tenant && !initialised) {
    setEnabled((loyaltySettings.enabled as boolean) ?? false);
    setEarnRate(String((loyaltySettings.pointsPerDollar as number) ?? 1));
    setRedeemRate(String((loyaltySettings.pointsPerRedemptionDollar as number) ?? 100));
    setInitialised(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch('/tenants/current', {
        settings: {
          ...settings,
          loyalty: {
            enabled,
            pointsPerDollar: Number(earnRate),
            pointsPerRedemptionDollar: Number(redeemRate),
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'current'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          Loyalty Program
        </CardTitle>
        <CardDescription>
          Configure how customers earn and redeem loyalty points.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Enable loyalty program</label>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              enabled ? 'bg-primary' : 'bg-input',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 rounded-full bg-background shadow transition-transform',
                enabled ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Points earned per $1 spent</label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={earnRate}
              onChange={(e) => setEarnRate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">e.g. 1 = 1 point per dollar</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Points needed per $1 discount</label>
            <Input
              type="number"
              min={1}
              step={1}
              value={redeemRate}
              onChange={(e) => setRedeemRate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">e.g. 100 = 100 pts = $1 off</p>
          </div>
        </div>

        {earnRate && redeemRate && (
          <div className="rounded-md bg-muted p-3 text-sm">
            A <strong>$50</strong> purchase earns{' '}
            <strong>{(50 * Number(earnRate)).toFixed(0)} points</strong>
            {' '}(worth{' '}
            <strong>${((50 * Number(earnRate)) / Number(redeemRate)).toFixed(2)}</strong>
            {' '}in future discounts)
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button
            className="gap-2"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          <SavedBadge saved={saved} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Keyboard tab ─────────────────────────────────────────────────────────────

function KeyboardTab() {
  const [map, setMap] = useState<Record<string, string>>(() => loadHotkeyMap());
  const [recording, setRecording] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Find duplicate keys (excluding the one currently being recorded)
  const keyCounts: Record<string, string[]> = {};
  for (const [id, key] of Object.entries(map)) {
    if (!keyCounts[key]) keyCounts[key] = [];
    keyCounts[key].push(id);
  }
  const duplicates = new Set(
    Object.entries(keyCounts)
      .filter(([, ids]) => ids.length > 1)
      .flatMap(([, ids]) => ids),
  );

  const startRecording = useCallback((id: string) => {
    setRecording(id);
  }, []);

  useEffect(() => {
    if (!recording) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      const key = eventToKey(e);
      setMap((prev) => ({ ...prev, [recording!]: key }));
      setRecording(null);
    }
    document.addEventListener('keydown', onKey, { capture: true });
    return () => document.removeEventListener('keydown', onKey, { capture: true });
  }, [recording]);

  function handleSave() {
    saveHotkeyMap(map);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    resetHotkeyMap();
    setMap(loadHotkeyMap());
  }

  const navDefs = DEFAULT_HOTKEYS.filter((d) => d.group === 'Navigation');
  const actionDefs = DEFAULT_HOTKEYS.filter((d) => d.group === 'Actions');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Keyboard className="h-5 w-5" />
          Keyboard Shortcuts
        </CardTitle>
        <CardDescription>
          Click any key badge to remap it. Press the new key (or Escape to cancel).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Navigation
            </p>
            <div className="space-y-1">
              {navDefs.map((def) => {
                const key = map[def.id] ?? def.defaultKey;
                const isRecording = recording === def.id;
                const isDupe = duplicates.has(def.id);
                return (
                  <div key={def.id} className="flex items-center justify-between gap-4 py-1">
                    <span className="text-sm">{def.label}</span>
                    <button
                      onClick={() => startRecording(def.id)}
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono whitespace-nowrap transition-colors',
                        isRecording
                          ? 'border-primary bg-primary/10 text-primary animate-pulse'
                          : isDupe
                          ? 'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20'
                          : 'border-border bg-muted hover:bg-muted/80',
                      )}
                    >
                      {isRecording ? 'press key…' : key}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Actions
            </p>
            <div className="space-y-1">
              {actionDefs.map((def) => {
                const key = map[def.id] ?? def.defaultKey;
                const isRecording = recording === def.id;
                const isDupe = duplicates.has(def.id);
                return (
                  <div key={def.id} className="flex items-center justify-between gap-4 py-1">
                    <span className="text-sm">{def.label}</span>
                    <button
                      onClick={() => startRecording(def.id)}
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono whitespace-nowrap transition-colors',
                        isRecording
                          ? 'border-primary bg-primary/10 text-primary animate-pulse'
                          : isDupe
                          ? 'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20'
                          : 'border-border bg-muted hover:bg-muted/80',
                      )}
                    >
                      {isRecording ? 'press key…' : key}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {duplicates.size > 0 && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Some shortcuts share the same key — highlighted in red. Resolve conflicts before saving.
          </p>
        )}

        <div className="flex items-center gap-3 pt-2 border-t">
          <Button className="gap-2" onClick={handleSave} disabled={duplicates.size > 0}>
            <Save className="h-4 w-4" />
            Save Shortcuts
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </Button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── Hardware tab ────────────────────────────────────────────────────────────

function HardwareTab() {
  const [config, setConfig] = useState(() => loadPrinterConfig());
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [scanValue, setScanValue] = useState('');

  function save() {
    savePrinterConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testPrint() {
    setTestStatus('Printing…');
    try {
      const escpos = generateEscPos({
        storeName: 'RetailOS',
        orderId: 'TEST0001',
        completedAt: new Date().toISOString(),
        items: [{ name: 'Test Item', quantity: 1, price: 9.99, discount: 0 }],
        subtotal: 9.99,
        taxAmount: 0.80,
        total: 10.79,
        payments: [{ method: 'cash', amount: 11.00 }],
        change: 0.21,
        footer: '*** TEST PRINT ***',
      }, config.charWidth ?? 42);
      await sendToPrinter(escpos, config);
      setTestStatus('Done');
    } catch (e) {
      setTestStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setTimeout(() => setTestStatus(null), 3000);
  }

  async function testDrawer() {
    setTestStatus('Opening drawer…');
    try {
      await openCashDrawer(config);
      setTestStatus('Signal sent');
    } catch (e) {
      setTestStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setTimeout(() => setTestStatus(null), 3000);
  }

  return (
    <div className="space-y-6">
      {/* Receipt Printer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Receipt Printer
          </CardTitle>
          <CardDescription>
            Configure the thermal receipt printer for this device. Network printers use ESC/POS over TCP (port 9100).
            Browser Print uses the OS print dialog as a fallback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Printer Type</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={config.type ?? 'browser'}
              onChange={(e) => setConfig((c) => ({ ...c, type: e.target.value as 'network' | 'browser' }))}
            >
              <option value="browser">Browser Print (OS dialog)</option>
              <option value="network">Network (ESC/POS TCP) — requires Tauri app</option>
            </select>
          </div>

          {config.type === 'network' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-sm font-medium">Printer IP Address</label>
                  <Input
                    placeholder="192.168.1.100"
                    value={config.host ?? ''}
                    onChange={(e) => setConfig((c) => ({ ...c, host: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Port</label>
                  <Input
                    type="number"
                    placeholder="9100"
                    value={config.port ?? 9100}
                    onChange={(e) => setConfig((c) => ({ ...c, port: Number(e.target.value) }))}
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Paper Width</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={config.charWidth ?? 42}
              onChange={(e) => setConfig((c) => ({ ...c, charWidth: Number(e.target.value) as 32 | 42 }))}
            >
              <option value={32}>58mm paper (32 chars)</option>
              <option value={42}>80mm paper (42 chars)</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={save}>Save</Button>
            <Button variant="outline" onClick={testPrint} disabled={testStatus === 'Printing…'}>
              <Printer className="h-4 w-4 mr-1.5" />
              Test Print
            </Button>
            <SavedBadge saved={saved} />
            {testStatus && <span className="text-sm text-muted-foreground">{testStatus}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Cash Drawer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg">💰</span> Cash Drawer
          </CardTitle>
          <CardDescription>
            Cash drawers are triggered via an ESC/POS pulse through the receipt printer. Configure the printer above first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={testDrawer} disabled={testStatus === 'Opening drawer…'}>
            Test Open Drawer
          </Button>
          {testStatus?.includes('drawer') && (
            <span className="ml-3 text-sm text-muted-foreground">{testStatus}</span>
          )}
        </CardContent>
      </Card>

      {/* Barcode Scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Barcode className="h-5 w-5" /> Barcode Scanner
          </CardTitle>
          <CardDescription>
            Most barcode scanners work as keyboard wedge devices (HID) — they type the barcode value followed by Enter.
            No configuration is required; just plug in and scan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Test Scan</p>
          <p className="text-xs text-muted-foreground">
            Click the field below, then scan a barcode. The decoded value will appear here.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Scan a barcode here…"
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              className="font-mono"
            />
            <Button variant="outline" onClick={() => setScanValue('')}>Clear</Button>
          </div>
          {scanValue && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Barcode className="h-4 w-4" />
              Scanned: <span className="font-mono font-medium">{scanValue}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Features tab ────────────────────────────────────────────────────────────

const FEATURE_GROUPS = ['Sales', 'Catalog', 'Customers', 'Procurement', 'Team'] as const;

function FeaturesTab() {
  const queryClient = useQueryClient();
  const { data: tenant } = useTenant();
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;

  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [initialised, setInitialised] = useState(false);
  const [saved, setSaved] = useState(false);

  if (tenant && !initialised) {
    setFlags(getFeatureFlags((settings.features ?? {}) as Record<string, boolean>));
    setInitialised(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch('/tenants/current', { settings: { ...settings, features: flags } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'current'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Feature Toggles</CardTitle>
          <CardDescription>
            Enable or disable modules to match your workflow. Disabled features are hidden from the navigation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {FEATURE_GROUPS.map((group) => {
            const defs = FEATURE_DEFS.filter((d) => d.group === group);
            return (
              <div key={group}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {group}
                </h3>
                <div className="space-y-1">
                  {defs.map((def) => {
                    const enabled = flags[def.key] ?? true;
                    return (
                      <button
                        key={def.key}
                        type="button"
                        onClick={() => setFlags((f) => ({ ...f, [def.key]: !enabled }))}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div>
                          <p className="text-sm font-medium">{def.label}</p>
                          <p className="text-xs text-muted-foreground">{def.description}</p>
                        </div>
                        {enabled ? (
                          <ToggleRight className="h-6 w-6 text-primary shrink-0 ml-4" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-muted-foreground shrink-0 ml-4" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
            <SavedBadge saved={saved} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Integrations tab ────────────────────────────────────────────────────────

interface IntegrationStatus {
  configured: boolean;
  connected: boolean;
  companyName?: string;
  orgName?: string;
  connectedAt?: string;
  lastSync?: string;
}

function IntegrationCard({
  name,
  logo,
  description,
  statusKey,
  connectEndpoint,
  syncEndpoint,
  disconnectEndpoint,
  orgLabel,
}: {
  name: string;
  logo: React.ReactNode;
  description: string;
  statusKey: string;
  connectEndpoint: string;
  syncEndpoint: string;
  disconnectEndpoint: string;
  orgLabel: string;
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [syncResult, setSyncResult] = useState<{ pushed: number; errors: Array<{ orderId: string; error: string }> } | null>(null);

  const { data: status, isLoading } = useQuery<IntegrationStatus>({
    queryKey: ['integration-status', statusKey],
    queryFn: () => api.get(`/integrations/${statusKey}/status`).then((r) => r.data.data),
    retry: false,
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post(`/integrations/${syncEndpoint}/sync`, null, { params: { from, to } }).then((r) => r.data.data),
    onSuccess: (d) => {
      setSyncResult(d);
      qc.invalidateQueries({ queryKey: ['integration-status', statusKey] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete(`/integrations/${disconnectEndpoint}/disconnect`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration-status', statusKey] }),
  });

  async function handleConnect() {
    const { data } = await api.get(`/integrations/${connectEndpoint}/connect`);
    window.open(data.data.url, '_blank', 'width=600,height=700,noopener');
    // Poll status after a short delay so the newly-opened tab has time to complete OAuth
    setTimeout(() => qc.invalidateQueries({ queryKey: ['integration-status', statusKey] }), 3000);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {logo}
            <div>
              <CardTitle className="text-base">{name}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          <Badge variant={status?.connected ? 'success' : 'secondary'} className="shrink-0">
            {isLoading ? '…' : status?.connected ? 'Connected' : status?.configured ? 'Not connected' : 'Not configured'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.configured && !isLoading && (
          <p className="text-xs text-muted-foreground rounded-md bg-muted/50 border p-3">
            Set <code className="font-mono">{statusKey.toUpperCase().replace('-', '_')}_CLIENT_ID</code> and{' '}
            <code className="font-mono">{statusKey.toUpperCase().replace('-', '_')}_CLIENT_SECRET</code> environment
            variables on the API server to enable this integration.
          </p>
        )}

        {status?.connected && (
          <div className="text-sm space-y-1">
            <p><span className="text-muted-foreground">{orgLabel}:</span> <strong>{status.companyName ?? status.orgName}</strong></p>
            {status.connectedAt && <p className="text-xs text-muted-foreground">Connected {new Date(status.connectedAt).toLocaleDateString()}</p>}
            {status.lastSync && <p className="text-xs text-muted-foreground">Last synced {new Date(status.lastSync).toLocaleString()}</p>}
          </div>
        )}

        {status?.connected && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Manual sync — push completed orders</p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <label className="text-xs text-muted-foreground">From</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 w-36 text-xs" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-muted-foreground">To</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 w-36 text-xs" />
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? 'Syncing…' : 'Sync'}
              </Button>
            </div>
            {syncResult && (
              <div className="text-xs rounded-md border px-3 py-2 space-y-1">
                <p className="text-green-700 font-medium">{syncResult.pushed} order{syncResult.pushed !== 1 ? 's' : ''} pushed</p>
                {syncResult.errors.map((e, i) => (
                  <p key={i} className="text-destructive">{e.orderId.slice(-8).toUpperCase()}: {e.error}</p>
                ))}
              </div>
            )}
            {syncMutation.isError && (
              <p className="text-xs text-destructive">{(syncMutation.error as Error).message}</p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {!status?.connected && status?.configured && (
            <Button size="sm" variant="outline" onClick={handleConnect}>Connect {name}</Button>
          )}
          {status?.connected && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationsTab() {
  const [searchParams] = useSearchParams();
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected === 'quickbooks') setSuccessMsg('QuickBooks connected successfully!');
    if (connected === 'xero') setSuccessMsg('Xero connected successfully!');
  }, [searchParams]);

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {successMsg}
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold">Accounting Integrations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your accounting software to automatically push completed orders. Each sale creates a sales receipt or bank transaction in real time.
        </p>
      </div>

      <IntegrationCard
        name="QuickBooks Online"
        logo={<div className="w-8 h-8 rounded-md bg-[#2CA01C] flex items-center justify-center text-white text-xs font-bold shrink-0">QB</div>}
        description="Push completed orders as SalesReceipts. Creates a 'POS Sales' service item automatically."
        statusKey="quickbooks"
        connectEndpoint="quickbooks"
        syncEndpoint="quickbooks"
        disconnectEndpoint="quickbooks"
        orgLabel="Company"
      />

      <IntegrationCard
        name="Xero"
        logo={<div className="w-8 h-8 rounded-md bg-[#13B5EA] flex items-center justify-center text-white text-xs font-bold shrink-0">Xe</div>}
        description="Push completed orders as bank transactions. Uses account codes 200 (Sales), 820 (Tax), 090 (Bank) by default."
        statusKey="xero"
        connectEndpoint="xero"
        syncEndpoint="xero"
        disconnectEndpoint="xero"
        orgLabel="Organisation"
      />

      <TwilioCard />
      <MailchimpCard />
    </div>
  );
}

// ─── Twilio config card ───────────────────────────────────────────────────────

function TwilioCard() {
  const queryClient = useQueryClient();
  const { data: statusData, isLoading } = useQuery({
    queryKey: ['integrations', 'twilio', 'status'],
    queryFn: () => api.get('/integrations/twilio/status').then((r) => r.data.data),
  });

  const connected: boolean = statusData?.configured ?? false;
  const [showForm, setShowForm] = useState(false);
  const [fields, setFields] = useState({ accountSid: '', authToken: '', fromNumber: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testTo, setTestTo] = useState('');

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/integrations/twilio/config', fields);
      queryClient.invalidateQueries({ queryKey: ['integrations', 'twilio'] });
      setShowForm(false);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    setTestMsg('');
    try {
      await api.post('/integrations/twilio/test', { to: testTo, message: 'RetailOS test message' });
      setTestMsg('Sent!');
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : 'Failed');
    }
    setTesting(false);
  };

  const disconnect = async () => {
    await api.delete('/integrations/twilio/disconnect');
    queryClient.invalidateQueries({ queryKey: ['integrations', 'twilio'] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-[#F22F46] flex items-center justify-center text-white text-xs font-bold shrink-0">Tw</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Twilio SMS</CardTitle>
              {!isLoading && (
                <Badge variant={connected ? 'default' : 'secondary'} className="text-xs">
                  {connected ? 'Connected' : 'Not connected'}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs mt-0.5">
              Send order receipts and loyalty notifications via SMS.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!showForm && !connected && (
          <Button size="sm" onClick={() => setShowForm(true)}>Configure Twilio</Button>
        )}
        {!showForm && connected && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>Update Credentials</Button>
            <Button size="sm" variant="destructive" onClick={disconnect}>Disconnect</Button>
          </div>
        )}
        {showForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Account SID</label>
                <Input size={1} className="h-8 text-xs" placeholder="ACxxxxxxxx" value={fields.accountSid} onChange={(e) => setFields((f) => ({ ...f, accountSid: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Auth Token</label>
                <Input size={1} className="h-8 text-xs" type="password" placeholder="••••••••" value={fields.authToken} onChange={(e) => setFields((f) => ({ ...f, authToken: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">From Number</label>
              <Input size={1} className="h-8 text-xs" placeholder="+15551234567" value={fields.fromNumber} onChange={(e) => setFields((f) => ({ ...f, fromNumber: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {connected && !showForm && (
          <div className="flex gap-2 items-end">
            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium">Send test to</label>
              <Input size={1} className="h-8 text-xs" placeholder="+15551234567" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={test} disabled={testing || !testTo}>
              {testing ? 'Sending…' : 'Test'}
            </Button>
            {testMsg && <span className="text-xs text-muted-foreground">{testMsg}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Mailchimp config card ────────────────────────────────────────────────────

function MailchimpCard() {
  const queryClient = useQueryClient();
  const { data: statusData, isLoading } = useQuery({
    queryKey: ['integrations', 'mailchimp', 'status'],
    queryFn: () => api.get('/integrations/mailchimp/status').then((r) => r.data.data),
  });

  const connected: boolean = statusData?.configured ?? false;
  const [showForm, setShowForm] = useState(false);
  const [fields, setFields] = useState({ apiKey: '', audienceId: '' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/integrations/mailchimp/config', fields);
      queryClient.invalidateQueries({ queryKey: ['integrations', 'mailchimp'] });
      setShowForm(false);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const syncAll = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await api.post('/integrations/mailchimp/sync');
      const d = res.data.data as { synced: number; errors: number };
      setSyncResult(`${d.synced} synced, ${d.errors} errors`);
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : 'Failed');
    }
    setSyncing(false);
  };

  const disconnect = async () => {
    await api.delete('/integrations/mailchimp/disconnect');
    queryClient.invalidateQueries({ queryKey: ['integrations', 'mailchimp'] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-[#FFE01B] flex items-center justify-center text-black text-xs font-bold shrink-0">Mc</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Mailchimp</CardTitle>
              {!isLoading && (
                <Badge variant={connected ? 'default' : 'secondary'} className="text-xs">
                  {connected ? 'Connected' : 'Not connected'}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs mt-0.5">
              Sync customers to an audience list. New and updated customers sync automatically.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!showForm && !connected && (
          <Button size="sm" onClick={() => setShowForm(true)}>Configure Mailchimp</Button>
        )}
        {!showForm && connected && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={syncAll} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync All Customers'}
            </Button>
            {syncResult && <span className="text-xs text-muted-foreground self-center">{syncResult}</span>}
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>Update API Key</Button>
            <Button size="sm" variant="destructive" onClick={disconnect}>Disconnect</Button>
          </div>
        )}
        {showForm && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">API Key</label>
              <Input size={1} className="h-8 text-xs" placeholder="xxxxxxxx-us6" type="password" value={fields.apiKey} onChange={(e) => setFields((f) => ({ ...f, apiKey: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Audience ID</label>
              <Input size={1} className="h-8 text-xs" placeholder="abc123def" value={fields.audienceId} onChange={(e) => setFields((f) => ({ ...f, audienceId: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Catalog tab (Product Types, Categories, Classes, Finelines) ─────────────

type CatalogSection = 'types' | 'categories' | 'classes' | 'finelines';

function CatalogTab() {
  const qc = useQueryClient();
  const [section, setSection] = useState<CatalogSection>('types');
  const [newName, setNewName] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: typesData } = useQuery({ queryKey: ['product-types'], queryFn: () => api.get('/product-types').then(r => r.data.data) });
  const { data: catsData } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories').then(r => r.data.data) });
  const { data: classesData } = useQuery({ queryKey: ['product-classes', selectedCatId], queryFn: () => api.get('/product-classes', { params: { categoryId: selectedCatId } }).then(r => r.data.data), enabled: !!selectedCatId });
  const { data: finelinesData } = useQuery({ queryKey: ['finelines', selectedClassId], queryFn: () => api.get('/finelines', { params: { classId: selectedClassId } }).then(r => r.data.data), enabled: !!selectedClassId });

  const types: Array<{ id: string; name: string }> = typesData ?? [];
  const cats: Array<{ id: string; name: string; productTypeId?: string }> = catsData ?? [];
  const classes: Array<{ id: string; name: string }> = classesData ?? [];
  const finelines: Array<{ id: string; name: string }> = finelinesData ?? [];

  async function addItem() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      if (section === 'types') {
        await api.post('/product-types', { name: newName.trim() });
        qc.invalidateQueries({ queryKey: ['product-types'] });
      } else if (section === 'categories') {
        await api.post('/categories', { name: newName.trim(), productTypeId: selectedTypeId || undefined });
        qc.invalidateQueries({ queryKey: ['categories'] });
      } else if (section === 'classes') {
        if (!selectedCatId) return;
        await api.post('/product-classes', { name: newName.trim(), categoryId: selectedCatId });
        qc.invalidateQueries({ queryKey: ['product-classes', selectedCatId] });
      } else {
        if (!selectedClassId) return;
        await api.post('/finelines', { name: newName.trim(), classId: selectedClassId });
        qc.invalidateQueries({ queryKey: ['finelines', selectedClassId] });
      }
      setNewName('');
    } catch (err) { console.error(err); }
    setSaving(false);
  }

  async function deleteItem(endpoint: string, id: string, queryKey: unknown[]) {
    if (!confirm('Delete this item? Products assigned to it will be unlinked.')) return;
    await api.delete(`/${endpoint}/${id}`);
    qc.invalidateQueries({ queryKey });
  }

  const SECTIONS: Array<{ id: CatalogSection; label: string }> = [
    { id: 'types', label: 'Product Types' },
    { id: 'categories', label: 'Categories' },
    { id: 'classes', label: 'Classes' },
    { id: 'finelines', label: 'Finelines' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Catalog Hierarchy</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Organize products: <span className="font-medium">Product Type → Category → Class → Fineline</span>
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${section === s.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'types' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Product Types</CardTitle><CardDescription>Top-level classification (e.g. Construction, Retail)</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="divide-y border rounded-lg overflow-hidden">
              {types.length === 0 && <p className="p-3 text-sm text-muted-foreground">No product types yet</p>}
              {types.map(t => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium">{t.name}</span>
                  <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={() => deleteItem('product-types', t.id, ['product-types'])}>Remove</Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New type name (e.g. Construction)" onKeyDown={e => e.key === 'Enter' && addItem()} className="h-8 text-sm" />
              <Button size="sm" onClick={addItem} disabled={saving || !newName.trim()}>Add</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {section === 'categories' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Categories</CardTitle><CardDescription>Second level — assign to a product type optionally</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Filter by Product Type</label>
              <Select value={selectedTypeId || '__all__'} onValueChange={v => setSelectedTypeId(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="divide-y border rounded-lg overflow-hidden">
              {cats.filter(c => !selectedTypeId || c.productTypeId === selectedTypeId).length === 0 && <p className="p-3 text-sm text-muted-foreground">No categories yet</p>}
              {cats.filter(c => !selectedTypeId || c.productTypeId === selectedTypeId).map(c => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={() => deleteItem('categories', c.id, ['categories'])}>Remove</Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New category name" onKeyDown={e => e.key === 'Enter' && addItem()} className="h-8 text-sm flex-1" />
              <Button size="sm" onClick={addItem} disabled={saving || !newName.trim()}>Add</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {section === 'classes' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Classes</CardTitle><CardDescription>Third level — belongs to a category</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Category *</label>
              <Select value={selectedCatId || '__none__'} onValueChange={v => { setSelectedCatId(v === '__none__' ? '' : v); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select a category…</SelectItem>
                  {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedCatId && (
              <>
                <div className="divide-y border rounded-lg overflow-hidden">
                  {classes.length === 0 && <p className="p-3 text-sm text-muted-foreground">No classes for this category</p>}
                  {classes.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-medium">{c.name}</span>
                      <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={() => deleteItem('product-classes', c.id, ['product-classes', selectedCatId])}>Remove</Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New class name" onKeyDown={e => e.key === 'Enter' && addItem()} className="h-8 text-sm flex-1" />
                  <Button size="sm" onClick={addItem} disabled={saving || !newName.trim()}>Add</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {section === 'finelines' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Finelines</CardTitle><CardDescription>Fourth level — belongs to a class</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Category *</label>
                <Select value={selectedCatId || '__none__'} onValueChange={v => { setSelectedCatId(v === '__none__' ? '' : v); setSelectedClassId(''); }}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select…</SelectItem>
                    {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Class *</label>
                <Select value={selectedClassId || '__none__'} onValueChange={v => setSelectedClassId(v === '__none__' ? '' : v)} disabled={!selectedCatId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={selectedCatId ? 'Select class' : 'Select category first'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select…</SelectItem>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedClassId && (
              <>
                <div className="divide-y border rounded-lg overflow-hidden">
                  {finelines.length === 0 && <p className="p-3 text-sm text-muted-foreground">No finelines for this class</p>}
                  {finelines.map(f => (
                    <div key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-medium">{f.name}</span>
                      <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={() => deleteItem('finelines', f.id, ['finelines', selectedClassId])}>Remove</Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New fineline name" onKeyDown={e => e.key === 'Enter' && addItem()} className="h-8 text-sm flex-1" />
                  <Button size="sm" onClick={addItem} disabled={saving || !newName.trim()}>Add</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Audit Log tab ────────────────────────────────────────────────────────────

function AuditLogTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', page],
    queryFn: () => api.get('/audit-log', { params: { page, pageSize: 50 } }).then((r) => r.data),
  });

  const entries: Array<{ id: string; action: string; entity: string; entityId?: string; summary?: string; createdAt: string; user?: { name: string } }> = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const pageCount: number = data?.pageCount ?? 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Audit Log</CardTitle>
        <CardDescription>Admin and manager actions across the system.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No audit events yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">When</th>
                <th className="text-left p-3 font-medium">User</th>
                <th className="text-left p-3 font-medium">Action</th>
                <th className="text-left p-3 font-medium">Entity</th>
                <th className="text-left p-3 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="p-3 whitespace-nowrap text-muted-foreground text-xs">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3">{e.user?.name ?? '—'}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs capitalize">{e.action}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{e.entity}</td>
                  <td className="p-3 text-muted-foreground truncate max-w-xs">{e.summary ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between p-3 border-t text-sm">
            <span className="text-muted-foreground">{total} total</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <span className="px-2 py-1 text-xs">{page} / {pageCount}</span>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const qTab = searchParams.get('tab') as Tab | null;
    return qTab && allTabs.some((t) => t.id === qTab) ? qTab : 'terminal';
  });

  const { data: tenant } = useTenant();
  const tenantSettings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const features = getFeatureFlags((tenantSettings.features ?? {}) as Record<string, boolean>);

  const visibleTabs = allTabs.filter((t) => {
    if (t.adminOnly && !isAdmin) return false;
    if (t.id === 'loyalty' && !features.loyalty) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'terminal'  && <TerminalTab />}
      {tab === 'keyboard'  && <KeyboardTab />}
      {tab === 'hardware'  && <HardwareTab />}
      {tab === 'general'   && isAdmin && <GeneralTab />}
      {tab === 'catalog'   && isAdmin && <CatalogTab />}
      {tab === 'locations' && isAdmin && <LocationsTab />}
      {tab === 'registers' && isAdmin && <RegistersTab />}
      {tab === 'users'     && isAdmin && <UsersTab />}
      {tab === 'loyalty'   && isAdmin && <LoyaltyTab />}
      {tab === 'integrations' && isAdmin && <IntegrationsTab />}
      {tab === 'features'     && isAdmin && <FeaturesTab />}
      {tab === 'audit'        && isAdmin && <AuditLogTab />}
    </div>
  );
}
