import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { StepProps } from '../types';

export function NotesStep({ state, onAdvance, onBack }: StepProps) {
  const [notes, setNotes] = useState((state.meta.notes as string) ?? '');

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="order-notes">Order Notes</Label>
        <textarea
          id="order-notes"
          className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="e.g. Gift wrap, call on delivery, special instructions…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          autoFocus
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => onAdvance({ meta: { ...state.meta, notes: undefined } })}>
          Skip
        </Button>
        <Button className="flex-1" onClick={() => onAdvance({ meta: { ...state.meta, notes: notes.trim() || undefined } })}>
          Continue
        </Button>
      </div>
    </div>
  );
}
