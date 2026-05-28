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
} from 'lucide-react';
import { DEFAULT_HOTKEYS, loadHotkeyMap, saveHotkeyMap, resetHotkeyMap, eventToKey } from '@/lib/hotkeys';
import { FEATURE_DEFS, getFeatureFlags } from '@/lib/features';
import type { PaymentTerminalConfig } from '@pos/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Location = { id: string; name: string; address?: string; phone?: string; active: boolean };
type Register = { id: string; name: string; mode: string; locationId: string; location: { id: string; name: string } };
type User = { id: string; name: string; email: string; role: string; createdAt: string };
type Tenant = { id: string; name: string; slug: string; settings: Record<string, unknown> };

// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = 'terminal' | 'general' | 'locations' | 'registers' | 'users' | 'loyalty' | 'keyboard' | 'features';

const allTabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
  { id: 'terminal',  label: 'Terminal' },
  { id: 'keyboard',  label: 'Keyboard' },
  { id: 'general',   label: 'General',   adminOnly: true },
  { id: 'locations', label: 'Locations', adminOnly: true },
  { id: 'registers', label: 'Registers', adminOnly: true },
  { id: 'users',     label: 'Users',     adminOnly: true },
  { id: 'loyalty',   label: 'Loyalty',   adminOnly: true },
  { id: 'features',  label: 'Features',  adminOnly: true },
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
  const [saved, setSaved] = useState(false);
  const [initialised, setInitialised] = useState(false);

  if (tenant && !initialised) {
    setName(tenant.name ?? '');
    setTaxRate(String(((settings.taxRate as number) ?? 0) * 100));
    setCurrency((settings.currency as string) ?? 'USD');
    setTimezone((settings.timezone as string) ?? 'America/New_York');
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
      {tab === 'general'   && isAdmin && <GeneralTab />}
      {tab === 'locations' && isAdmin && <LocationsTab />}
      {tab === 'registers' && isAdmin && <RegistersTab />}
      {tab === 'users'     && isAdmin && <UsersTab />}
      {tab === 'loyalty'   && isAdmin && <LoyaltyTab />}
      {tab === 'features'  && isAdmin && <FeaturesTab />}
    </div>
  );
}
