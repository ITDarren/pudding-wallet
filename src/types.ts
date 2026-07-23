/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Timestamp } from "firebase/firestore";

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
  balance: number;
  cashBalance?: number;
  lastActive: Timestamp;
  isGlobalHidden?: boolean;
  hiddenAccountIds?: string[];
  hiddenCategoryIds?: string[];
  expenseCategoryOrder?: string[];
  incomeCategoryOrder?: string[];
  categoryColumns?: number;
}

export type TransactionType = "expense" | "income" | "transfer";

export interface Transaction {
  id?: string;
  amount: number;
  type: TransactionType;
  category: string;
  note: string;
  timestamp: Timestamp;
  createdAt?: Timestamp;
  accountId?: string;
  toAccountId?: string;
}

export interface CustomCategory {
  id?: string;
  name: string;
  emoji: string;
  type: TransactionType;
  order: number;
  createdAt: Timestamp;
}

export interface BankAccount {
  id?: string;
  name: string;
  bankName: string;
  balance: number;
  color: string;
  order: number;
  createdAt: Timestamp;
}

export const EXPENSE_CATEGORIES: Record<string, string> = {
  "Food": "餐飲",
  "Shopping": "日常購物",
  "Transport": "交通",
  "Living": "居家生活",
  "Clothing": "衣著服飾",
  "Bills": "生活帳單",
  "Beauty": "美容保養",
  "Entertainment": "娛樂休閒",
  "Social": "社交人情",
  "Travel": "旅遊",
  "Home": "家居裝修",
  "Repair": "維修保養",
  "Health": "醫療保健",
  "Pet": "寵物",
  "Education": "教育進修",
  "Others": "其他"
};

export const INCOME_CATEGORIES: Record<string, string> = {
  "Salary": "薪資",
  "Bonus": "獎金",
  "Investment": "投資收入",
  "SideHustle": "兼職收入",
  "Gift": "禮金收入",
  "Others": "其他"
};

export const CATEGORIES: Record<string, string> = {
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES
};
