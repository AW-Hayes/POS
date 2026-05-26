export type GiftCardTransactionType = 'issue' | 'redeem' | 'reload' | 'void';

export interface GiftCard {
  id: string;
  tenantId: string;
  code: string;
  balance: number;
  initialBalance: number;
  active: boolean;
  expiresAt?: string;
  issuedAt: string;
}

export interface GiftCardTransaction {
  id: string;
  giftCardId: string;
  orderId?: string;
  type: GiftCardTransactionType;
  amount: number;
  balanceAfter: number;
  note?: string;
  createdAt: string;
}

export interface IssueGiftCardRequest {
  code?: string;
  initialBalance: number;
  expiresAt?: string;
}

export interface ReloadGiftCardRequest {
  amount: number;
  note?: string;
}
