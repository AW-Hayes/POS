import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  group: 'Sales' | 'Catalog' | 'Customers' | 'Procurement' | 'Team';
}

export const FEATURE_DEFS: FeatureDef[] = [
  // Sales
  { key: 'returns',        label: 'Returns',          description: 'Process customer returns and refunds',          group: 'Sales' },
  { key: 'estimates',      label: 'Estimates',         description: 'Create quotes and estimates for customers',     group: 'Sales' },
  { key: 'layaway',        label: 'Layaway',           description: 'Accept layaway deposits and track orders',     group: 'Sales' },
  { key: 'serviceTickets', label: 'Service Tickets',   description: 'Track repair and service jobs',                group: 'Sales' },
  // Catalog
  { key: 'bundles',        label: 'Product Bundles',   description: 'Sell products bundled together at a set price', group: 'Catalog' },
  { key: 'inventory',      label: 'Inventory',         description: 'Track stock levels across locations',          group: 'Catalog' },
  { key: 'cycleCounts',    label: 'Cycle Counts',      description: 'Perform periodic inventory audits',            group: 'Catalog' },
  { key: 'promotions',     label: 'Promotions',        description: 'Set up discount rules and promotional pricing', group: 'Catalog' },
  { key: 'priceLevels',    label: 'Price Levels',      description: 'Customer-specific pricing tiers',             group: 'Catalog' },
  { key: 'giftCards',      label: 'Gift Cards',        description: 'Sell and redeem gift cards',                   group: 'Catalog' },
  // Customers
  { key: 'customers',      label: 'Customers',         description: 'Track customer profiles and purchase history', group: 'Customers' },
  { key: 'loyalty',        label: 'Loyalty Program',   description: 'Points-based customer rewards',               group: 'Customers' },
  // Procurement
  { key: 'vendors',        label: 'Vendors',           description: 'Manage supplier contacts and information',    group: 'Procurement' },
  { key: 'purchaseOrders', label: 'Purchase Orders',   description: 'Create and track purchase orders',            group: 'Procurement' },
  { key: 'stockTransfers', label: 'Stock Transfers',   description: 'Move inventory between locations',            group: 'Procurement' },
  // Team
  { key: 'timeClock',      label: 'Time Clock',        description: 'Track employee clock-in and clock-out times', group: 'Team' },
  { key: 'reports',        label: 'Reports',           description: 'Sales reports and business analytics',        group: 'Team' },
];

export type FeatureFlags = Record<string, boolean>;

export function getFeatureFlags(stored: Record<string, boolean> = {}): FeatureFlags {
  return Object.fromEntries(FEATURE_DEFS.map((d) => [d.key, stored[d.key] ?? true]));
}

export function useFeatures(): FeatureFlags {
  const { data: tenant } = useQuery<{ settings?: { features?: Record<string, boolean> } }>({
    queryKey: ['tenant', 'current'],
    queryFn: () => api.get('/tenants/current').then((r) => r.data.data),
  });
  return getFeatureFlags(tenant?.settings?.features);
}
