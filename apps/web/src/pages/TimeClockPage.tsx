import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';
import { Clock, LogIn, LogOut, Coffee } from 'lucide-react';
import type { TimeEntry } from '@pos/types';
import { useAuthStore } from '@/stores/auth';

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function elapsed(clockIn: string) {
  const mins = Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000);
  return formatMinutes(mins);
}

export function TimeClockPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [reportFrom, setReportFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(new Date().toISOString().slice(0, 10));
  const [showReport, setShowReport] = useState(false);

  const { data: currentEntry, isLoading: loadingCurrent } = useQuery({
    queryKey: ['timeclock-current'],
    queryFn: () => api.get('/time-clock/me/current').then((r) => r.data.data as TimeEntry | null),
    refetchInterval: 30000,
  });

  const { data: myHistory } = useQuery({
    queryKey: ['timeclock-history', user?.id],
    enabled: !!user?.id,
    queryFn: () =>
      api.get(`/time-clock/users/${user!.id}`).then((r) => r.data.data),
  });

  const isManager = ['manager', 'admin'].includes(user?.role ?? '');

  const { data: reportData } = useQuery({
    queryKey: ['timeclock-report', reportFrom, reportTo],
    enabled: showReport && isManager,
    queryFn: () =>
      api
        .get('/time-clock/report', {
          params: { from: `${reportFrom}T00:00:00.000Z`, to: `${reportTo}T23:59:59.999Z` },
        })
        .then((r) => r.data.data as Array<{
          user: { id: string; name: string };
          totalMinutes: number;
          entries: TimeEntry[];
        }>),
  });

  const clockInMutation = useMutation({
    mutationFn: (type: 'work' | 'break') =>
      api.post('/time-clock/clock-in', { type, note: note || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeclock-current'] });
      qc.invalidateQueries({ queryKey: ['timeclock-history'] });
      setNote('');
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: () => api.post('/time-clock/clock-out', { note: note || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeclock-current'] });
      qc.invalidateQueries({ queryKey: ['timeclock-history'] });
      setNote('');
    },
  });

  if (loadingCurrent) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Time Clock</h1>
        {isManager && (
          <Button variant="outline" size="sm" onClick={() => setShowReport(!showReport)}>
            {showReport ? 'My Clock' : 'Team Report'}
          </Button>
        )}
      </div>

      {!showReport && (
        <>
          {/* Status card */}
          <div className="border rounded-lg p-5 flex items-center gap-4">
            <div className={`p-3 rounded-full ${currentEntry ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
              <Clock className="h-6 w-6" />
            </div>
            <div className="flex-1">
              {currentEntry ? (
                <>
                  <p className="font-semibold">
                    Clocked {currentEntry.type === 'break' ? 'on break' : 'in'} —{' '}
                    <span className="text-green-600">{elapsed(currentEntry.clockIn)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">Since {formatDate(currentEntry.clockIn)}</p>
                </>
              ) : (
                <p className="font-semibold text-muted-foreground">Not clocked in</p>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-3">
            <Input
              placeholder="Optional note…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex gap-2">
              {!currentEntry ? (
                <>
                  <Button
                    onClick={() => clockInMutation.mutate('work')}
                    disabled={clockInMutation.isPending}
                  >
                    <LogIn className="h-4 w-4 mr-2" /> Clock In
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => clockInMutation.mutate('break')}
                    disabled={clockInMutation.isPending}
                  >
                    <Coffee className="h-4 w-4 mr-2" /> Start Break
                  </Button>
                </>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => clockOutMutation.mutate()}
                  disabled={clockOutMutation.isPending}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Clock Out
                </Button>
              )}
            </div>
          </div>

          {/* My recent history */}
          {myHistory?.entries?.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold text-sm">Recent Entries</h2>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Type</th>
                      <th className="text-left p-3 font-medium">Clock In</th>
                      <th className="text-left p-3 font-medium">Clock Out</th>
                      <th className="text-right p-3 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {myHistory.entries.slice(0, 10).map((e: TimeEntry) => {
                      const mins = e.clockOut
                        ? Math.round((new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 60000)
                        : null;
                      return (
                        <tr key={e.id}>
                          <td className="p-3">
                            <Badge variant={e.type === 'work' ? 'success' : 'secondary'}>{e.type}</Badge>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">{formatDate(e.clockIn)}</td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {e.clockOut ? formatDate(e.clockOut) : <span className="text-green-600">In progress</span>}
                          </td>
                          <td className="p-3 text-right text-xs">
                            {mins != null ? formatMinutes(mins) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Total (all time): {formatMinutes(myHistory.totalMinutes)}
              </p>
            </div>
          )}
        </>
      )}

      {/* Manager report */}
      {showReport && isManager && (
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">From</label>
              <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">To</label>
              <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="w-40" />
            </div>
          </div>

          {(reportData ?? []).map((emp) => (
            <div key={emp.user.id} className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 p-3 flex justify-between items-center">
                <span className="font-semibold">{emp.user.name}</span>
                <span className="text-sm text-muted-foreground">Total: {formatMinutes(emp.totalMinutes)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {emp.entries.map((e) => {
                    const mins = e.clockOut
                      ? Math.round((new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 60000)
                      : null;
                    return (
                      <tr key={e.id}>
                        <td className="p-3">
                          <Badge variant={e.type === 'work' ? 'success' : 'secondary'}>{e.type}</Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{formatDate(e.clockIn)}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {e.clockOut ? formatDate(e.clockOut) : '—'}
                        </td>
                        <td className="p-3 text-right text-xs">{mins != null ? formatMinutes(mins) : 'Open'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {(reportData ?? []).length === 0 && (
            <p className="text-muted-foreground">No entries for this period</p>
          )}
        </div>
      )}
    </div>
  );
}
