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
  "Food": "餐飲美食",
  "Shopping": "購物消費",
  "Transport": "交通出行",
  "Bills": "居家生活",
  "Health": "醫療健康",
  "Entertainment": "休閒娛樂",
  "Mobile": "通訊通訊",
  "Social": "社交活動",
  "Repair": "維修保養",
  "Pet": "寵物生活",
  "Beauty": "美容彩妝",
  "Home": "居家裝修",
  "Travel": "旅行出遊",
  "Education": "進修教育",
  "Others": "其他雜項"
};

export const INCOME_CATEGORIES: Record<string, string> = {
  "Salary": "薪資收入",
  "Bonus": "獎金回饋",
  "Investment": "投資收益",
  "SideHustle": "兼職外快",
  "Gift": "收到禮金",
  "Others": "其他收入"
};

export const CATEGORIES: Record<string, string> = {
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES
};
