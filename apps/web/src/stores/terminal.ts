import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TerminalMode } from '@pos/types';

interface TerminalState {
  mode: TerminalMode;
  registerId: string | null;
  locationId: string | null;
  sessionId: string | null;
  setMode: (mode: TerminalMode) => void;
  setRegister: (registerId: string, locationId: string) => void;
  setSession: (sessionId: string | null) => void;
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set) => ({
      mode: 'desktop',
      registerId: null,
      locationId: null,
      sessionId: null,
      setMode: (mode) => set({ mode }),
      setRegister: (registerId, locationId) => set({ registerId, locationId }),
      setSession: (sessionId) => set({ sessionId }),
    }),
    { name: 'pos_terminal' },
  ),
);
