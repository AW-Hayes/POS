export type UserRole = 'admin' | 'manager' | 'cashier';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  hasPin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokenPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface PinLoginRequest {
  registerId: string;
  pin: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['*'],
  manager: [
    'orders.read', 'orders.write', 'orders.void',
    'products.read', 'products.write',
    'inventory.read', 'inventory.write',
    'customers.read', 'customers.write',
    'reports.read',
    'registers.read',
  ],
  cashier: [
    'orders.read', 'orders.write',
    'products.read',
    'inventory.read',
    'customers.read',
    'registers.read',
  ],
};
