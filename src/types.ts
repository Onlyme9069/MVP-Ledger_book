export type UserRole = 'Super Admin' | 'Admin' | 'Finance Manager' | 'Aarthik Pramukh' | 'Viewer';

export interface User {
  id: string; // Document ID
  userId: string; // Unique username/ID for login
  name: string;
  passwordHash: string;
  role: UserRole;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
  biometricEnabled?: boolean;
  biometricCredentialId?: string;
  biometricPublicKey?: string;
  sessionToken?: string;
  lastLoginAt?: string;
}

export interface TransactionRecord {
  id: string; // Document ID
  transactionNature: 'Income' | 'Expense';
  moneySender: string;
  moneyReceiver: string;
  transactionType: 'Cash' | 'UPI' | 'Other';
  amount: number;
  purpose: string;
  transactionDate: string; // YYYY-MM-DD
  notes: string;
  createdBy: string; // userId of creator
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  organizationName: string;
  createdAt: string;
  monthlyBudget?: number;
  yearlyBudget?: number;
  budgetUpdatedBy?: string;
  budgetUpdatedAt?: string;
}

export interface Notice {
  id: string;
  recordId: string;
  recordPurpose: string;
  recordAmount: number;
  reason: string;
  customReason?: string;
  reportedBy: string;
  reporterName: string;
  status: 'reported' | 'resolved';
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string; // "all" for general group chat, or specific userId for private chat
  content: string;
  createdAt: string;
  isEdited?: boolean;
  isPinned?: boolean;
  pinnedBy?: string;
  isDeleted?: boolean;
  isRead?: boolean;
  replyToId?: string;
  replyToContent?: string;
  replyToSenderName?: string;
  reactions?: { [userId: string]: string };
}

export type ActiveTab = 'home' | 'analytics' | 'profile' | 'settings' | 'users' | 'notices';
