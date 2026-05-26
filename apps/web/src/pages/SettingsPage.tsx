import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTerminalStore } from '@/stores/terminal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Monitor, Tablet, List, BookOpen, CreditCard, Save } from 'lucide-react';
import type { PaymentTerminalConfig } from '@pos/types';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { mode, setMode, registerId, setRegister } = useTerminalStore();
  const queryClient = useQueryClient();

  const { data: registers } = useQuery({
    queryKey: ['registers'],
    queryFn: () => api.get('/registers').then((r) => r.data.data),
  });

  const { data: tenantData } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.get('/tenants/me').then((r) => r.data.data),
  });

  const existingConfig: PaymentTerminalConfig = tenantData?.settings?.paymentTerminal ?? {
    provider: 'none',
    environment: 'sandbox',
  };

  const [ptConfig, setPtConfig] = useState<PaymentTerminalConfig>(existingConfig);
  const [ptSaved, setPtSaved] = useState(false);

  const updateTenantMutation = useMutation({
    mutationFn: (settings: Record<string, unknown>) => api.put('/tenants/me', { settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'me'] });
      setPtSaved(true);
      setTimeout(() => setPtSaved(false), 2000);
    },
  });

  function saveTerminalConfig() {
    const currentSettings = tenantData?.settings ?? {};
    updateTenantMutation.mutate({ ...currentSettings, paymentTerminal: ptConfig });
  }

  const terminalModes = [
    { id: 'desktop' as const, icon: <Monitor className="h-5 w-5" />, label: 'Desktop' },
    { id: 'touch' as const, icon: <Tablet className="h-5 w-5" />, label: 'Touch' },
    { id: 'line-item' as const, icon: <List className="h-5 w-5" />, label: 'Line Item' },
    { id: 'quickfind' as const, icon: <BookOpen className="h-5 w-5" />, label: 'QuickFind' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Terminal mode */}
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

      {/* Register */}
      <Card>
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>
            Assign this device to a register. This determines which location's inventory is
            used and links sessions to this register.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {registers?.map((reg: { id: string; name: string; mode: string; location: { name: string }; locationId: string }) => (
            <div
              key={reg.id}
              className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
                registerId === reg.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              }`}
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
            <p className="text-muted-foreground text-sm">No registers configured.</p>
          )}
        </CardContent>
      </Card>

      {/* Payment terminal */}
      {user?.role === 'admin' && (
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                        readerIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      }))
                    }
                  />
                </div>
              </>
            )}

            <Button
              className="gap-2"
              onClick={saveTerminalConfig}
              disabled={updateTenantMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {ptSaved ? 'Saved!' : updateTenantMutation.isPending ? 'Saving…' : 'Save Configuration'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-sm"><span className="text-muted-foreground">Name:</span> {user?.name}</p>
          <p className="text-sm"><span className="text-muted-foreground">Email:</span> {user?.email}</p>
          <p className="text-sm">
            <span className="text-muted-foreground">Role:</span>{' '}
            <Badge variant="secondary" className="capitalize">{user?.role}</Badge>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
