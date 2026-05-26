export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  currency: string;
  timezone: string;
  taxRate: number;
  receiptFooter?: string;
  logoUrl?: string;
}

export interface Location {
  id: string;
  tenantId: string;
  name: string;
  address?: string;
  phone?: string;
  settings: LocationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface LocationSettings {
  taxRate?: number;
  receiptPrinter?: string;
}

export type TerminalMode = 'touch' | 'desktop';

export interface Register {
  id: string;
  locationId: string;
  name: string;
  mode: TerminalMode;
  settings: RegisterSettings;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterSettings {
  showCustomerDisplay?: boolean;
  requirePinOnEveryTransaction?: boolean;
  defaultTaxRate?: number;
}
