import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, UserCheck, UserX } from 'lucide-react';
import type { StepProps } from '../types';
import type { Customer } from '@pos/types';

export function CustomerStep({ state, onAdvance, onBack }: StepProps) {
  const [search, setSearch] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['customers', 'search', search],
    queryFn: () =>
      api.get('/customers', { params: { q: search, pageSize: 8 } }).then((r) => r.data.data as Customer[]),
    enabled: search.length >= 2,
  });

  function selectCustomer(customer: Customer) {
    onAdvance({ customerId: customer.id, customerName: customer.name });
  }

  function skipCustomer() {
    onAdvance({ customerId: undefined, customerName: undefined });
  }

  return (
    <div className="space-y-4">
      {state.customerId ? (
        <div className="flex items-center gap-3 rounded-md border p-3 bg-primary/5 border-primary">
          <UserCheck className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="font-medium">{state.customerName}</p>
            <p className="text-xs text-muted-foreground">Customer attached</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onAdvance({ customerId: undefined, customerName: undefined })}>
            Remove
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {!state.customerId && search.length >= 2 && (
        <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
          {isFetching && (
            <p className="text-sm text-muted-foreground p-3">Searching…</p>
          )}
          {!isFetching && data?.length === 0 && (
            <p className="text-sm text-muted-foreground p-3">No customers found</p>
          )}
          {data?.map((customer) => (
            <button
              key={customer.id}
              className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
              onClick={() => selectCustomer(customer)}
            >
              <p className="text-sm font-medium">{customer.name}</p>
              <p className="text-xs text-muted-foreground">
                {[customer.email, customer.phone].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={skipCustomer}
        >
          <UserX className="h-4 w-4" />
          Skip
        </Button>
        <Button
          className="flex-1"
          onClick={() => onAdvance()}
          disabled={!state.customerId && search.length > 0 && (data?.length ?? 0) > 0}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
