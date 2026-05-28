import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DEFAULT_HOTKEYS, loadHotkeyMap } from '@/lib/hotkeys';
import { Keyboard } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ open, onClose }: Props) {
  const navigate = useNavigate();
  const map = loadHotkeyMap();

  const nav = DEFAULT_HOTKEYS.filter((d) => d.group === 'Navigation');
  const actions = DEFAULT_HOTKEYS.filter((d) => d.group === 'Actions');

  // Deduplicate actions by action.id (e.g. two "help" entries)
  const uniqueActions = actions.filter((d, i, arr) => {
    if (d.action.type !== 'action') return true;
    const actionId = d.action.id;
    return arr.findIndex((x) => x.action.type === 'action' && x.action.id === actionId) === i;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-semibold mb-2 text-muted-foreground uppercase text-xs tracking-wide">Navigation</p>
            <div className="space-y-1.5">
              {nav.map((def) => (
                <div key={def.id} className="flex items-center justify-between gap-4">
                  <span>{def.label}</span>
                  <Kbd>{map[def.id] ?? def.defaultKey}</Kbd>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-semibold mb-2 text-muted-foreground uppercase text-xs tracking-wide">Actions</p>
            <div className="space-y-1.5">
              {uniqueActions.map((def) => (
                <div key={def.id} className="flex items-center justify-between gap-4">
                  <span>{def.label}</span>
                  <Kbd>{map[def.id] ?? def.defaultKey}</Kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { onClose(); navigate('/settings?tab=keyboard'); }}
          >
            Customize shortcuts
          </Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono whitespace-nowrap">
      {children}
    </kbd>
  );
}
