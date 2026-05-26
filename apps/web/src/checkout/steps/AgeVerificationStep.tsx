import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { StepProps } from '../types';

/**
 * Shown when any cart item has requiresAgeVerification = true.
 * Cashier enters customer's date of birth; if they meet the minimum
 * age for all restricted items the pipeline advances.
 */
export function AgeVerificationStep({ state, onAdvance, onBack }: StepProps) {
  const [dob, setDob] = useState('');
  const [error, setError] = useState<string | null>(null);

  const minAge = state.cart
    .filter((i) => i.requiresAgeVerification)
    .reduce((max, _) => Math.max(max, 21), 0); // default 21 if not specified

  function verify() {
    if (!dob) { setError('Enter date of birth'); return; }
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) { setError('Invalid date'); return; }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;

    if (age < minAge) {
      setError(`Customer must be at least ${minAge} years old`);
      return;
    }
    onAdvance({ meta: { ...state.meta, ageVerified: true, verifiedAge: age } });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-md bg-amber-50 border border-amber-200 p-4">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-900">Age-restricted items in cart</p>
          <p className="text-sm text-amber-700 mt-1">
            This order contains items that require customers to be {minAge}+. Verify ID before proceeding.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Customer date of birth</label>
        <Input
          type="date"
          value={dob}
          onChange={(e) => { setDob(e.target.value); setError(null); }}
          max={new Date().toISOString().split('T')[0]}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1 gap-2" onClick={verify} disabled={!dob}>
          <ShieldCheck className="h-4 w-4" />
          Verify &amp; Continue
        </Button>
      </div>
    </div>
  );
}
