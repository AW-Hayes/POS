import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadHotkeyMap, DEFAULT_HOTKEYS, eventToKey } from '@/lib/hotkeys';

interface UseGlobalHotkeysOpts {
  onEod: () => void;
  onCashMgmt: () => void;
  onHelp: () => void;
  sessionId: string | null;
}

export function useGlobalHotkeys({ onEod, onCashMgmt, onHelp, sessionId }: UseGlobalHotkeysOpts) {
  const navigate = useNavigate();

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      // Don't fire when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      const key = eventToKey(e);
      const map = loadHotkeyMap();

      // Build reverse map: key → id
      const reverseMap: Record<string, string> = {};
      for (const [id, k] of Object.entries(map)) reverseMap[k] = id;

      const id = reverseMap[key];
      if (!id) return;

      const def = DEFAULT_HOTKEYS.find((d) => d.id === id);
      if (!def) return;

      e.preventDefault();

      if (def.action.type === 'navigate') {
        navigate(def.action.to);
        return;
      }

      // Named actions
      switch (def.action.id) {
        case 'help':
          onHelp();
          break;
        case 'terminal-alt':
          navigate('/terminal');
          break;
        case 'orders-alt':
          navigate('/orders');
          break;
        case 'search':
          document.dispatchEvent(new CustomEvent('pos:focus-search'));
          break;
        case 'eod':
          if (sessionId) onEod();
          break;
        case 'cash':
          if (sessionId) onCashMgmt();
          break;
      }
    }

    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [navigate, onEod, onCashMgmt, onHelp, sessionId]);
}
