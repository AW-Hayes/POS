export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTerminalConfig {
  provider: 'none' | 'stripe' | 'square';
  environment: 'sandbox' | 'production';
  apiKey?: string;
  locationId?: string;
  readerIds?: string[];
}

export interface TenantSettings {
  currency: string;
  timezone: string;
  taxRate: number;
  receiptFooter?: string;
  logoUrl?: string;
  paymentTerminal?: PaymentTerminalConfig;
  features?: Record<string, boolean>;
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

export type TerminalMode = 'touch' | 'desktop' | 'line-item' | 'quickfind';

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
