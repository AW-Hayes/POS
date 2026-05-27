import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, UserCheck, UserX, AlertCircle, Tag } from 'lucide-react';
import type { StepProps } from '../types';
import type { Customer } from '@pos/types';

interface CustomerDetail extends Customer {
  priceLevel?: { id: string; name: string; discount: number } | null;
}

export function CustomerStep({ state, onAdvance, onBack }: StepProps) {
  const [search, setSearch] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['customers', 'search', search],
    queryFn: () =>
      api.get('/customers', { params: { q: search, pageSize: 8 } }).then((r) => r.data.data as CustomerDetail[]),
    enabled: search.length >= 2,
  });

  const { data: selectedCustomer } = useQuery<CustomerDetail>({
    queryKey: ['customer-detail', state.customerId],
    queryFn: () => api.get(`/customers/${state.customerId}`).then((r) => r.data.data),
    enabled: !!state.customerId,
  });

  function selectCustomer(customer: CustomerDetail) {
    onAdvance({ customerId: customer.id, customerName: customer.name });
  }

  function skipCustomer() {
    onAdvance({ customerId: undefined, customerName: undefined });
  }

  return (
    <div className="space-y-4">
      {state.customerId ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-md border p-3 bg-primary/5 border-primary">
            <UserCheck className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="font-medium">{state.customerName}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedCustomer?.taxExempt && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                    Tax Exempt
                  </Badge>
                )}
                {selectedCustomer?.priceLevel && (
                  <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 bg-blue-50">
                    <Tag className="h-2.5 w-2.5 mr-1" />
                    {selectedCustomer.priceLevel.name} pricing
                  </Badge>
                )}
                {selectedCustomer?.arBalance != null && selectedCustomer.arBalance > 0 && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    AR balance
                  </Badge>
                )}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onAdvance({ customerId: undefined, customerName: undefined })}>
              Remove
            </Button>
          </div>

          {selectedCustomer?.notes && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{selectedCustomer.notes}</p>
            </div>
          )}
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
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{customer.name}</p>
                {customer.taxExempt && (
                  <Badge variant="outline" className="text-xs py-0">Tax Exempt</Badge>
                )}
                {customer.priceLevel && (
                  <Badge variant="outline" className="text-xs py-0">{customer.priceLevel.name}</Badge>
                )}
              </div>
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
