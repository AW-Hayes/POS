import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTerminalStore } from '@/stores/terminal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Monitor, Tablet } from 'lucide-react';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { mode, setMode, registerId, setRegister } = useTerminalStore();

  const { data: registers } = useQuery({
    queryKey: ['registers'],
    queryFn: () => api.get('/registers').then((r) => r.data.data),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Terminal Mode</CardTitle>
          <CardDescription>
            Choose the control scheme for this device. Touch mode uses larger targets and simplified
            layouts suitable for tablets or kiosk screens.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button
            variant={mode === 'desktop' ? 'default' : 'outline'}
            className="flex-1 h-20 flex-col gap-2"
            onClick={() => setMode('desktop')}
          >
            <Monitor className="h-6 w-6" />
            <span>Desktop</span>
          </Button>
          <Button
            variant={mode === 'touch' ? 'default' : 'outline'}
            className="flex-1 h-20 flex-col gap-2"
            onClick={() => setMode('touch')}
          >
            <Tablet className="h-6 w-6" />
            <span>Touch</span>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>
            Assign this device to a register. This determines which location's inventory is used
            and links sessions to this register.
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

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-sm"><span className="text-muted-foreground">Name:</span> {user?.name}</p>
          <p className="text-sm"><span className="text-muted-foreground">Email:</span> {user?.email}</p>
          <p className="text-sm"><span className="text-muted-foreground">Role:</span> <Badge variant="secondary" className="capitalize">{user?.role}</Badge></p>
        </CardContent>
      </Card>
    </div>
  );
}
