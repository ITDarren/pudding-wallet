/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  onSnapshot,
  collection,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { motion, AnimatePresence } from "motion/react";
import {
  TrendingDown,
  TrendingUp,
  History,
  BarChart3,
  Book,
  ClipboardList,
  LogOut,
  Sparkles,
  Trash2,
  Pencil,
  X,
  Plus,
  Eye,
  EyeOff,
  ChevronUp,
  User as UserIcon,
  PieChart as LucidePieChart,
  LineChart as LucideLineChart,
  BarChart as LucideBarChart,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Delete,
  FileText,
  Search,
  AlertCircle,
  ArrowRightLeft,
  Clock,
  ArrowUpRight,
  ArrowDownLeft
} from "lucide-react";
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart as ReLineChart,
  Line,
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from "recharts";

import { db, auth, loginWithGoogle } from "./lib/firebase";
import {
  Transaction,
  UserProfile,
  CustomCategory,
  BankAccount,
  CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TransactionType
} from "./types";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const CHART_COLORS = [
  "#38bdf8", // Sky 400
  "#fb7185", // Rose 400
  "#34d399", // Emerald 400
  "#fbbf24", // Amber 400
  "#818cf8", // Indigo 400
  "#e879f9", // Fuchsia 400
  "#a3e635", // Lime 400
  "#f472b6", // Pink 400
  "#fb923c", // Orange 400
  "#2dd4bf", // Teal 400
  "#60a5fa", // Blue 400
  "#f87171", // Red 400
];

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  const errorJson = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errorJson);
  throw new Error(errorJson);
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

const getCategoryEmoji = (category: string, customCategories: CustomCategory[] = []) => {
  const custom = customCategories.find(c => c.id === category || c.name === category);
  if (custom) return custom.emoji;

  const mapping: Record<string, string> = {
    "Food": "🍽️",
    "Shopping": "🛍️",
    "Transport": "🚗",
    "Living": "🧻",
    "Clothing": "👕",
    "Bills": "📄",
    "Beauty": "💄",
    "Entertainment": "🎤",
    "Social": "👥",
    "Travel": "✈️",
    "Home": "🏘️",
    "Repair": "🔧",
    "Health": "🏥",
    "Pet": "🐱",
    "Education": "📚",
    "Income": "💰",
    "Salary": "💵",
    "Bonus": "🏆",
    "Investment": "📈",
    "SideHustle": "☕",
    "Gift": "🧧",
    "Others": "📦"
  };
  return mapping[category] || "✨";
};

const getCategoryLabel = (category: string, customCategories: CustomCategory[] = [], type?: TransactionType) => {
  const custom = customCategories.find(c => c.id === category || c.name === category);
  if (custom) return custom.name;

  if (category === "Others" && type) {
    if (type === "expense") return EXPENSE_CATEGORIES["Others"];
    if (type === "income") return INCOME_CATEGORIES["Others"];
  }

  return CATEGORIES[category] || category;
};

const getLocalISODate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const getSafeDate = (ts: any) => {
    if (!ts) return new Date();
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  };

  const recentPhrases = useMemo(() => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Filter transactions from last year with non-empty notes
    const pastYearTransactions = transactions
      .filter(t => t.note && t.note.trim() !== "" && getSafeDate(t.timestamp) >= oneYearAgo)
      .sort((a, b) => getSafeDate(b.timestamp).getTime() - getSafeDate(a.timestamp).getTime());

    // Get unique notes in order of recency
    const uniqueNotes = new Set<string>();
    const phrases: string[] = [];

    for (const t of pastYearTransactions) {
      const note = t.note!.trim();
      if (!uniqueNotes.has(note)) {
        uniqueNotes.add(note);
        phrases.push(note);
      }
      if (phrases.length >= 15) break; // Limit to top 15 for UI clarity
    }

    return phrases;
  }, [transactions]);

  const getSortedFixedCategories = useCallback((type: 'expense' | 'income') => {
    const labels = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    const allIds = Object.keys(labels);
    const savedOrder = type === 'expense' ? profile?.expenseCategoryOrder : profile?.incomeCategoryOrder;

    if (!savedOrder || savedOrder.length === 0) return allIds.map(id => [id, labels[id]]);

    const sortedIds = [...allIds].sort((a, b) => {
      const ai = savedOrder.indexOf(a);
      const bi = savedOrder.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return sortedIds.map(id => [id, labels[id]]);
  }, [profile?.expenseCategoryOrder, profile?.incomeCategoryOrder]);

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "stats" | "accounts" | "profile">("history");
  const [isTabLoading, setIsTabLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setNotification({ message: "網路已連線，已同步最新資料", type: "success" });
    };
    const handleOffline = () => {
      setIsOffline(true);
      setNotification({ message: "網路已中斷，已自動切換為離線模式", type: "error" });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleTabChange = (tab: "history" | "stats" | "accounts" | "profile") => {
    if (tab === activeTab) return;
    setIsTabLoading(true);
    setTimeout(() => {
      setActiveTab(tab);
      setIsTabLoading(false);
    }, 400); // 400ms loading duration
  };

  const [statsTimeframe, setStatsTimeframe] = useState<"month" | "year">("month");
  const [statsType, setStatsType] = useState<"expense" | "income">("expense");
  const [chartType, setChartType] = useState<"pie" | "line" | "bar">("pie");

  const [hiddenChartCategories, setHiddenChartCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (chartType === 'line' || chartType === 'bar') {
      setStatsTimeframe('year');
    }
    // Reset hidden categories when chart type or stats type changes
    setHiddenChartCategories(new Set());
  }, [chartType, statsType]);

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [keypadValue, setKeypadValue] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Food");
  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [selectedToAccountId, setSelectedToAccountId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [selectedDate, setSelectedDate] = useState(getLocalISODate());
  const [viewMonth, setViewMonth] = useState(getLocalISODate().slice(0, 7)); // YYYY-MM
  const [showAddCategory, setShowAddCategory] = useState<"expense" | "income" | null>(null);
  const [editingCategory, setEditingCategory] = useState<CustomCategory | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("✨");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [newBalance, setNewBalance] = useState("");
  const [newAccountColor, setNewAccountColor] = useState("#fcd34d");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFromAccountId, setSelectedFromAccountId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showAccountDetail, setShowAccountDetail] = useState<BankAccount | null>(null);
  const [accountDetailPage, setAccountDetailPage] = useState(1);
  const [showDeleteTransactionConfirm, setShowDeleteTransactionConfirm] = useState<Transaction | null>(null);
  const [selectedStatsCategory, setSelectedStatsCategory] = useState<{ id: string; name: string; emoji: string; type: 'expense' | 'income' } | null>(null);
  const [showDeleteCatConfirm, setShowDeleteCatConfirm] = useState<string | null>(null);
  const [catHasTransactionsNotice, setCatHasTransactionsNotice] = useState<boolean>(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const viewMonthRef = useRef<HTMLInputElement>(null);

  const [catManageType, setCatManageType] = useState<"expense" | "income">("expense");
  const [showCashTransfer, setShowCashTransfer] = useState<{ type: 'withdraw' | 'deposit', account: BankAccount } | null>(null);
  const [cashTransferAmount, setCashTransferAmount] = useState("");

  const isGlobalHidden = profile?.isGlobalHidden ?? false;
  const hiddenAccountIds = profile?.hiddenAccountIds ?? [];

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Sync Profile
        const profileRef = doc(db, "users", u.uid);
        const unsubscribeProfile = onSnapshot(profileRef, async (snap) => {
          if (!snap.exists()) {
            // Use merge: true to avoid overwriting existing data if exists() was a false negative
            // Removed balance: 0 to prevent accidental zeroing of existing assets
            const initialProfile: any = {
              uid: u.uid,
              displayName: u.displayName || "新用戶",
              photoURL: u.photoURL,
              lastActive: Timestamp.now()
            };
            await setDoc(profileRef, initialProfile, { merge: true });
          } else {
            setProfile(snap.data() as UserProfile);
          }
        }, (error) => {
          console.error("Profile Sync Error:", error);
          setNotification({ message: "無法同步個人資料，請檢查網路連線", type: "error" });
        });

        // Sync Transactions
        const tQuery = query(
          collection(db, "users", u.uid, "transactions"),
          orderBy("timestamp", "desc")
        );
        const unsubscribeTransactions = onSnapshot(tQuery, (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
          // Explicitly sort by timestamp DESC, then by createdAt DESC (or ID as fallback)
          list.sort((a, b) => {
            const dateA = getSafeDate(a.timestamp).getTime();
            const dateB = getSafeDate(b.timestamp).getTime();
            if (dateA !== dateB) return dateB - dateA;

            const createA = a.createdAt ? getSafeDate(a.createdAt).getTime() : 0;
            const createB = b.createdAt ? getSafeDate(b.createdAt).getTime() : 0;
            if (createA !== createB) return createB - createA;

            return (b.id || "").localeCompare(a.id || "");
          });
          setTransactions(list);
          setLoading(false);
        }, (error) => {
          console.error("Transactions Sync Error:", error);
          setNotification({ message: "無法同步交易紀錄，請檢查網路連線", type: "error" });
        });

        // Sync Custom Categories
        const catQuery = query(
          collection(db, "users", u.uid, "categories"),
          orderBy("createdAt", "asc")
        );
        const unsubscribeCategories = onSnapshot(catQuery, (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomCategory));
          const sortedList = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          setCustomCategories(sortedList);
        }, (error) => {
          console.error("Categories Sync Error:", error);
          setNotification({ message: "無法同步自訂分類", type: "error" });
        });

        // Sync Bank Accounts
        const accQuery = query(
          collection(db, "users", u.uid, "accounts"),
          orderBy("order", "asc")
        );
        const unsubscribeAccounts = onSnapshot(accQuery, (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as BankAccount));
          setAccounts(list);
        }, (error) => {
          console.error("Accounts Sync Error:", error);
          setNotification({ message: "無法同步帳戶資料，請檢查網路連線", type: "error" });
        });

        return () => {
          unsubscribeProfile();
          unsubscribeTransactions();
          unsubscribeCategories();
          unsubscribeAccounts();
        };
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleAddTransaction = async (data: any) => {
    if (!user || !profile) return;

    // Check balance for transfers
    if (data.type === "transfer") {
      const sourceAcc = accounts.find(a => a.id === data.accountId);
      if (sourceAcc && sourceAcc.balance < data.amount) {
        setNotification({
          message: `帳戶餘額不足！目前的餘額為：${sourceAcc.balance.toLocaleString()}`,
          type: 'error'
        });
        return;
      }
    }

    const batch = writeBatch(db);
    const updatedAccounts = [...accounts.map(acc => ({ ...acc }))];

    const entryTime = new Date();
    let finalTimestamp = Timestamp.fromDate(entryTime);

    if (data.date) {
      const [y, m, d] = data.date.split('-').map(Number);
      // Combine selected date with current time for entry sequence preservation
      const dateObj = new Date(y, m - 1, d, entryTime.getHours(), entryTime.getMinutes(), entryTime.getSeconds(), entryTime.getMilliseconds());
      finalTimestamp = Timestamp.fromDate(dateObj);
    }

    const newTransaction: Transaction = {
      amount: data.amount,
      type: data.type,
      category: data.category,
      note: data.note || "",
      timestamp: finalTimestamp,
      createdAt: Timestamp.fromDate(entryTime),
      accountId: data.accountId || null,
      toAccountId: data.toAccountId || null
    };

    try {
      if (data.type !== "transfer") {
        const transRef = doc(collection(db, "users", user.uid, "transactions"));
        batch.set(transRef, newTransaction);
      }

      // 1. Update Profile Balance & Cash Balance
      if (data.type !== "transfer") {
        const balanceOffset = data.type === "income" ? data.amount : -data.amount;
        const profileUpdates: any = {
          balance: profile.balance + balanceOffset,
          lastActive: Timestamp.now()
        };

        // 如果沒有選擇帳戶，則是現金交易，更新現金餘額
        if (!data.accountId) {
          const totalAccountBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
          const currentCash = profile.cashBalance ?? (profile.balance - totalAccountBalance);
          profileUpdates.cashBalance = currentCash + balanceOffset;
        }

        batch.update(doc(db, "users", user.uid), profileUpdates);
      } else {
        batch.update(doc(db, "users", user.uid), {
          lastActive: Timestamp.now()
        });
      }

      // 2. Update Accounts
      if (data.type === "transfer") {
        if (data.accountId) {
          const idx = updatedAccounts.findIndex(a => a.id === data.accountId);
          if (idx !== -1) updatedAccounts[idx].balance -= data.amount;
        }
        if (data.toAccountId) {
          const idx = updatedAccounts.findIndex(a => a.id === data.toAccountId);
          if (idx !== -1) updatedAccounts[idx].balance += data.amount;
        }
      } else if (data.accountId) {
        const idx = updatedAccounts.findIndex(a => a.id === data.accountId);
        if (idx !== -1) {
          const balanceOffset = data.type === "income" ? data.amount : -data.amount;
          updatedAccounts[idx].balance += balanceOffset;
        }
      }

      // 3. Batch update changed accounts
      updatedAccounts.forEach(newAcc => {
        const oldAcc = accounts.find(a => a.id === newAcc.id);
        if (oldAcc && Math.abs(oldAcc.balance - newAcc.balance) > 0.001) {
          batch.update(doc(db, "users", user.uid, "accounts", newAcc.id!), { balance: newAcc.balance });
        }
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/transactions`);
    }
  };

  const handleUpdateAccount = async (accountId: string, name: string, bankName: string, balance: number, color: string) => {
    if (!user || !profile) return;
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    const balanceDiff = balance - acc.balance;
    const batch = writeBatch(db);

    try {
      batch.update(doc(db, "users", user.uid, "accounts", accountId), {
        name,
        bankName,
        balance,
        color
      });

      // Update total asset balance, keep cash balance independent
      batch.update(doc(db, "users", user.uid), {
        balance: profile.balance + balanceDiff,
        lastActive: Timestamp.now()
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/accounts/${accountId}`);
    }
  };

  const handleDeleteTransaction = async (t: Transaction) => {
    if (!user || !profile || !t.id) return;

    const batch = writeBatch(db);
    const updatedAccounts = [...accounts.map(acc => ({ ...acc }))];

    try {
      // 1. Delete Doc
      batch.delete(doc(db, "users", user.uid, "transactions", t.id));

      // 2. Revert Balance Impact (Profile)
      // Transfers don't affect pool balance
      const balanceOffset = t.type === "income" ? -t.amount : (t.type === "expense" ? t.amount : 0);
      const profileUpdates: any = {
        balance: profile.balance + balanceOffset,
        lastActive: Timestamp.now()
      };

      if (!t.accountId && t.type !== 'transfer') {
        const totalAccountBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
        const currentCash = profile.cashBalance ?? (profile.balance - totalAccountBalance);
        profileUpdates.cashBalance = currentCash + balanceOffset;
      }

      batch.update(doc(db, "users", user.uid), profileUpdates);

      // 3. Revert Balance Impact (Accounts)
      if (t.type === "transfer") {
        if (t.accountId) {
          const idx = updatedAccounts.findIndex(a => a.id === t.accountId);
          if (idx !== -1) updatedAccounts[idx].balance += t.amount;
        }
        if (t.toAccountId) {
          const idx = updatedAccounts.findIndex(a => a.id === t.toAccountId);
          if (idx !== -1) updatedAccounts[idx].balance -= t.amount;
        }
      } else if (t.accountId) {
        const idx = updatedAccounts.findIndex(a => a.id === t.accountId);
        if (idx !== -1) {
          const accOffset = t.type === "income" ? -t.amount : t.amount;
          updatedAccounts[idx].balance += accOffset;
        }
      }

      // 4. Batch update changed accounts
      updatedAccounts.forEach(newAcc => {
        const oldAcc = accounts.find(a => a.id === newAcc.id);
        if (oldAcc && Math.abs(oldAcc.balance - newAcc.balance) > 0.001) {
          batch.update(doc(db, "users", user.uid, "accounts", newAcc.id!), { balance: newAcc.balance });
        }
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/transactions/${t.id}`);
    }
  };

  const getCategoryDisplayName = (categoryId: string, type?: TransactionType) => {
    const labels = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (categoryId === "Others" && type) return labels["Others"];
    if (CATEGORIES[categoryId]) return CATEGORIES[categoryId];
    const custom = customCategories.find(c => c.id === categoryId);
    return custom ? custom.name : categoryId;
  };

  const handleAddCustomCategory = async (name: string, emoji: string, type: "expense" | "income") => {
    if (!user) return;
    const sameTypeCategories = customCategories.filter(c => c.type === type);
    const maxOrder = sameTypeCategories.length > 0 ? Math.max(...sameTypeCategories.map(c => c.order || 0)) : 0;
    const newCat: CustomCategory = {
      name,
      emoji,
      type,
      order: maxOrder + 1,
      createdAt: Timestamp.now()
    };
    try {
      await addDoc(collection(db, "users", user.uid, "categories"), newCat);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/categories`);
    }
  };

  const handleUpdateCustomCategory = async (categoryId: string, name: string, emoji: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "categories", categoryId), {
        name,
        emoji
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/categories/${categoryId}`);
    }
  };

  const handleMoveCategory = async (categoryId: string, direction: 'up' | 'down') => {
    if (!user) return;
    const cat = customCategories.find(c => c.id === categoryId);
    if (!cat) return;

    const sameTypeCategories = customCategories.filter(c => c.type === cat.type);
    const index = sameTypeCategories.findIndex(c => c.id === categoryId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sameTypeCategories.length) return;

    const currentCat = sameTypeCategories[index];
    const targetCat = sameTypeCategories[newIndex];

    const batch = writeBatch(db);

    // Ensure both have valid order values for swapping
    // If legacy documents don't have order, use their current index in the sorted list
    const currentOrder = currentCat.order ?? index;
    const targetOrder = targetCat.order ?? newIndex;

    const currentRef = doc(db, "users", user.uid, "categories", currentCat.id!);
    const targetRef = doc(db, "users", user.uid, "categories", targetCat.id!);

    batch.update(currentRef, { order: targetOrder });
    batch.update(targetRef, { order: currentOrder });
    await batch.commit();
  };

  const handleDeleteCustomCategory = async (categoryId: string) => {
    if (!user) return;

    // 檢查是否有交易紀錄使用此分類
    const hasTransactions = transactions.some(t => t.category === categoryId);
    if (hasTransactions) {
      setCatHasTransactionsNotice(true);
      setShowDeleteCatConfirm(categoryId);
      return;
    }

    try {
      await deleteDoc(doc(db, "users", user.uid, "categories", categoryId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/categories/${categoryId}`);
    }
  };

  const handleMoveFixedCategory = async (categoryId: string, type: 'expense' | 'income', direction: 'up' | 'down') => {
    if (!user || !profile) return;
    const allIds = Object.keys(type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES);
    const savedOrder = type === 'expense' ? profile.expenseCategoryOrder : profile.incomeCategoryOrder;

    let currentOrder = allIds;
    if (savedOrder && savedOrder.length > 0) {
      currentOrder = [...allIds].sort((a, b) => {
        const ai = savedOrder.indexOf(a);
        const bi = savedOrder.indexOf(b);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }

    const currentIndex = currentOrder.indexOf(categoryId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;

    const newOrderList = [...currentOrder];
    const temp = newOrderList[currentIndex];
    newOrderList[currentIndex] = newOrderList[newIndex];
    newOrderList[newIndex] = temp;

    await updateDoc(doc(db, "users", user.uid), {
      [type === 'expense' ? 'expenseCategoryOrder' : 'incomeCategoryOrder']: newOrderList
    });
  };

  const handleAddAccount = async (name: string, bankName: string, balance: number, color: string) => {
    if (!user || !profile) return;
    const maxOrder = accounts.length > 0 ? Math.max(...accounts.map(a => a.order || 0)) : 0;
    const newAcc: BankAccount = {
      name,
      bankName,
      balance,
      color,
      order: maxOrder + 1,
      createdAt: Timestamp.now()
    };

    const batch = writeBatch(db);
    const accRef = doc(collection(db, "users", user.uid, "accounts"));

    try {
      batch.set(accRef, newAcc);

      // Update total asset balance, keep cash balance independent
      batch.update(doc(db, "users", user.uid), {
        balance: profile.balance + balance,
        lastActive: Timestamp.now()
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/accounts`);
    }
  };

  const handleMoveAccount = async (accountId: string, direction: 'up' | 'down') => {
    if (!user) return;
    const index = accounts.findIndex(a => a.id === accountId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= accounts.length) return;

    const currentAcc = accounts[index];
    const targetAcc = accounts[newIndex];

    const currentRef = doc(db, "users", user.uid, "accounts", currentAcc.id!);
    const targetRef = doc(db, "users", user.uid, "accounts", targetAcc.id!);

    const batch = writeBatch(db);
    batch.update(currentRef, { order: targetAcc.order });
    batch.update(targetRef, { order: currentAcc.order });
    await batch.commit();
  };

  const handleCashTransfer = async () => {
    if (!user || !profile || !showCashTransfer) return;
    const amount = parseFloat(cashTransferAmount);
    if (isNaN(amount) || amount <= 0) {
      setNotification({ message: '請輸入有效金額', type: 'error' });
      return;
    }

    const { type, account } = showCashTransfer;
    const totalAccountBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
    const cashBalance = profile.cashBalance ?? (profile.balance - totalAccountBalance);

    if (type === 'withdraw' && account.balance < amount) {
      setNotification({ message: '帳戶餘額不足', type: 'error' });
      return;
    }
    if (type === 'deposit' && cashBalance < amount) {
      setNotification({ message: '現金餘額不足', type: 'error' });
      return;
    }

    const batch = writeBatch(db);
    const accountRef = doc(db, "users", user.uid, "accounts", account.id!);
    const userRef = doc(db, "users", user.uid);

    const balanceChange = type === 'withdraw' ? -amount : amount;
    const cashChange = type === 'withdraw' ? amount : -amount;

    batch.update(accountRef, {
      balance: account.balance + balanceChange
    });

    batch.update(userRef, {
      cashBalance: cashBalance + cashChange,
      lastActive: Timestamp.now()
    });

    try {
      await batch.commit();
      setNotification({
        message: type === 'withdraw' ? `已提款 ${amount.toLocaleString()} 至現金` : `已存款 ${amount.toLocaleString()} 到帳戶`,
        type: 'success'
      });
      setShowCashTransfer(null);
      setCashTransferAmount("");
    } catch (error) {
      setNotification({ message: '操作失敗', type: 'error' });
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!user || !profile) return;

    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    const batch = writeBatch(db);
    try {
      batch.delete(doc(db, "users", user.uid, "accounts", accountId));

      // 同步扣除總資產，但不影響現金餘額，達到「不連動」
      batch.update(doc(db, "users", user.uid), {
        balance: profile.balance - acc.balance,
        lastActive: Timestamp.now()
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/accounts/${accountId}`);
    }
  };

  const toggleAccountVisibility = async (id: string) => {
    if (!user || !profile) return;
    const current = profile.hiddenAccountIds || [];
    const updated = current.includes(id) ? current.filter(i => i !== id) : [...current, id];
    try {
      await updateDoc(doc(db, "users", user.uid), {
        hiddenAccountIds: updated
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const toggleCategoryVisibility = async (id: string) => {
    if (!user || !profile) return;
    const current = profile.hiddenCategoryIds || [];
    const updated = current.includes(id) ? current.filter(i => i !== id) : [...current, id];
    try {
      await updateDoc(doc(db, "users", user.uid), {
        hiddenCategoryIds: updated
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const groupTransactionsByDate = () => {
    const groups: { [key: string]: Transaction[] } = {};
    if (!viewMonth) return groups;
    const [y, m] = viewMonth.split('-').map(Number);

    // Transactions matches the current view month and is already sorted newest first
    const filtered = transactions.filter(t => {
      const d = getSafeDate(t.timestamp);
      return d.getFullYear() === y && (d.getMonth() + 1) === m;
    });

    // Build the groups object
    filtered.forEach(t => {
      const d = getSafeDate(t.timestamp);
      const dateKey = d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short' });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(t);
    });

    // Since transactions were already sorted DESC, the groups should already be in order.
    // But Object.entries behavior for date strings is generally stable in modern JS.
    return groups;
  };

  const calculateExpression = (expr: string): string => {
    try {
      // Basic math evaluation for + and -
      // Using a simple split and reduce to avoid eval()
      const tokens = expr.split(/([+-])/);
      if (tokens.length === 0) return "";

      let total = parseInt(tokens[0]) || 0;
      for (let i = 1; i < tokens.length; i += 2) {
        const op = tokens[i];
        const val = parseInt(tokens[i + 1]) || 0;
        if (op === "+") total += val;
        if (op === "-") total -= val;
      }
      return total.toString();
    } catch {
      return expr;
    }
  };

  const handleKeypadPress = (val: string) => {
    if (val === "del") {
      setKeypadValue(prev => prev.slice(0, -1));
    } else if (val === "+" || val === "-") {
      // Prevent consecutive operators or starting with an operator
      if (keypadValue.length > 0 && !/[+-]$/.test(keypadValue)) {
        setKeypadValue(prev => prev + val);
      }
    } else if (val === "00") {
      if (keypadValue.length < 9) setKeypadValue(prev => prev + "00");
    } else {
      if (keypadValue.length < 10) setKeypadValue(prev => prev + val);
    }
  };

  const handleEquals = () => {
    if (!keypadValue) return;

    // If there is an operator, calculate it first
    if (/[+-]/.test(keypadValue)) {
      const result = calculateExpression(keypadValue);
      setKeypadValue(result);
    } else {
      // If it's already a single value, submit
      submitNewTransaction();
    }
  };

  const resetEntry = () => {
    setKeypadValue("");
    setNoteValue("");
    setIsAdding(false);
    setSelectedToAccountId(null);
    setSelectedFromAccountId(null);
  };

  const submitNewTransaction = async () => {
    const amount = parseFloat(keypadValue);
    if (isNaN(amount) || amount <= 0) return;

    // 提早擷取目前的輸入狀態，避免關閉視窗後狀態被清空
    const currentData = {
      amount,
      type: transactionType,
      category: selectedCategory,
      note: noteValue,
      date: selectedDate,
      accountId: transactionType === "transfer" ? selectedFromAccountId : selectedAccountId,
      toAccountId: selectedToAccountId
    };

    // 立即關閉視窗與重設輸入，提供流暢的使用者體驗
    resetEntry();
    setSelectedAccountId(null);

    try {
      await handleAddTransaction(currentData);
    } catch (error) {
      console.error("儲存失敗:", error);
      // 如果需要，之後可以加上提示
    }
  };
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchCategory, setSearchCategory] = useState<string | null>(null);
  const [searchStartDate, setSearchStartDate] = useState(() => {
    const now = new Date();
    // First day of previous month 00:00 local time
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [searchEndDate, setSearchEndDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Automatically reset selected category when query date range changes
  useEffect(() => {
    setSearchCategory(null);
  }, [searchStartDate, searchEndDate]);

  const availableCategories = useMemo(() => {
    if (!searchStartDate || !searchEndDate) return [];
    const sD = new Date(searchStartDate);
    const eD = new Date(searchEndDate);
    eD.setHours(23, 59, 59, 999);

    const filtered = transactions.filter(t => {
      const d = getSafeDate(t.timestamp);
      return d >= sD && d <= eD;
    });

    const categorySet = new Set<string>();
    const list: { id: string; name: string; emoji: string; type: TransactionType }[] = [];

    for (const t of filtered) {
      if (t.category && !categorySet.has(t.category)) {
        categorySet.add(t.category);
        const name = getCategoryLabel(t.category, customCategories, t.type);
        const emoji = getCategoryEmoji(t.category, customCategories);
        list.push({ id: t.category, name, emoji, type: t.type });
      }
    }

    // Sort categories: Expense first, then Income. Inside same type, sort by name
    return list.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'expense' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'zh-hant');
    });
  }, [transactions, searchStartDate, searchEndDate, customCategories]);

  const suggestedKeywords = useMemo(() => {
    if (!searchStartDate || !searchEndDate) return [];
    const sD = new Date(searchStartDate);
    const eD = new Date(searchEndDate);
    eD.setHours(23, 59, 59, 999);

    const filtered = transactions
      .filter(t => {
        const d = getSafeDate(t.timestamp);
        return d >= sD && d <= eD && t.note && t.note.trim() !== "";
      })
      .sort((a, b) => getSafeDate(b.timestamp).getTime() - getSafeDate(a.timestamp).getTime());

    const uniqueNotes = new Set<string>();
    const keywords: string[] = [];

    for (const t of filtered) {
      const note = t.note!.trim();
      if (!uniqueNotes.has(note)) {
        uniqueNotes.add(note);
        keywords.push(note);
      }
    }

    return keywords;
  }, [transactions, searchStartDate, searchEndDate]);

  const filteredSuggestions = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return suggestedKeywords;
    return suggestedKeywords.filter(note => note.toLowerCase().includes(kw));
  }, [suggestedKeywords, searchKeyword]);

  const [accSearchKeyword, setAccSearchKeyword] = useState("");
  const [accSearchCategory, setAccSearchCategory] = useState<string | null>(null);
  const [accSearchStartDate, setAccSearchStartDate] = useState(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [accSearchEndDate, setAccSearchEndDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [accIsSearchFocused, setAccIsSearchFocused] = useState(false);

  // Automatically reset selected category when query date range changes for account details
  useEffect(() => {
    setAccSearchCategory(null);
  }, [accSearchStartDate, accSearchEndDate]);

  const accAvailableCategories = useMemo(() => {
    if (!showAccountDetail || !accSearchStartDate || !accSearchEndDate) return [];
    const sD = new Date(accSearchStartDate);
    const eD = new Date(accSearchEndDate);
    eD.setHours(23, 59, 59, 999);

    const filtered = transactions.filter(t => {
      const d = getSafeDate(t.timestamp);
      return d >= sD && d <= eD &&
        (t.type === 'income' || t.type === 'expense') &&
        t.accountId === showAccountDetail.id;
    });

    const categorySet = new Set<string>();
    const list: { id: string; name: string; emoji: string; type: TransactionType }[] = [];

    for (const t of filtered) {
      if (t.category && !categorySet.has(t.category)) {
        categorySet.add(t.category);
        const name = getCategoryLabel(t.category, customCategories, t.type);
        const emoji = getCategoryEmoji(t.category, customCategories);
        list.push({ id: t.category, name, emoji, type: t.type });
      }
    }

    return list.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'expense' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'zh-hant');
    });
  }, [transactions, accSearchStartDate, accSearchEndDate, showAccountDetail]);

  const accSuggestedKeywords = useMemo(() => {
    if (!showAccountDetail || !accSearchStartDate || !accSearchEndDate) return [];
    const sD = new Date(accSearchStartDate);
    const eD = new Date(accSearchEndDate);
    eD.setHours(23, 59, 59, 999);

    const filtered = transactions
      .filter(t => {
        const d = getSafeDate(t.timestamp);
        return d >= sD && d <= eD && t.note && t.note.trim() !== "" &&
          (t.type === 'income' || t.type === 'expense') &&
          t.accountId === showAccountDetail.id;
      })
      .sort((a, b) => getSafeDate(b.timestamp).getTime() - getSafeDate(a.timestamp).getTime());

    const uniqueNotes = new Set<string>();
    const keywords: string[] = [];

    for (const t of filtered) {
      const note = t.note!.trim();
      if (!uniqueNotes.has(note)) {
        uniqueNotes.add(note);
        keywords.push(note);
      }
    }

    return keywords;
  }, [transactions, accSearchStartDate, accSearchEndDate, showAccountDetail]);

  const accFilteredSuggestions = useMemo(() => {
    const kw = accSearchKeyword.trim().toLowerCase();
    if (!kw) return accSuggestedKeywords;
    return accSuggestedKeywords.filter(note => note.toLowerCase().includes(kw));
  }, [accSuggestedKeywords, accSearchKeyword]);

  const handleUpdateTransaction = async (updated: Transaction) => {
    if (!user || !profile || !updated.id) return;

    try {
      const original = transactions.find(t => t.id === updated.id);
      if (!original) return;

      const batch = writeBatch(db);

      // Use a local copy to track balance changes fairly
      const updatedAccounts = [...accounts.map(acc => ({ ...acc }))];

      // 1. Revert original impact
      if (original.type === "transfer") {
        if (original.accountId) {
          const idx = updatedAccounts.findIndex(a => a.id === original.accountId);
          if (idx !== -1) updatedAccounts[idx].balance += original.amount;
        }
        if (original.toAccountId) {
          const idx = updatedAccounts.findIndex(a => a.id === original.toAccountId);
          if (idx !== -1) updatedAccounts[idx].balance -= original.amount;
        }
      } else if (original.accountId) {
        const offset = original.type === "income" ? -original.amount : original.amount;
        const idx = updatedAccounts.findIndex(a => a.id === original.accountId);
        if (idx !== -1) updatedAccounts[idx].balance += offset;
      }

      // 2. Apply new impact (with balance check for new transfer)
      if (updated.type === "transfer") {
        if (updated.accountId) {
          const idx = updatedAccounts.findIndex(a => a.id === updated.accountId);
          if (idx !== -1) {
            if (updatedAccounts[idx].balance < updated.amount) {
              setNotification({
                message: `帳戶餘額不足！目前的餘額為：${updatedAccounts[idx].balance.toLocaleString()}`,
                type: 'error'
              });
              return;
            }
            updatedAccounts[idx].balance -= updated.amount;
          }
        }
        if (updated.toAccountId) {
          const idx = updatedAccounts.findIndex(a => a.id === updated.toAccountId);
          if (idx !== -1) updatedAccounts[idx].balance += updated.amount;
        }
      } else if (updated.accountId) {
        const newOffset = updated.type === "income" ? updated.amount : -updated.amount;
        const idx = updatedAccounts.findIndex(a => a.id === updated.accountId);
        if (idx !== -1) {
          // Optional: also check balance for non-transfer expenses if desired, 
          // but specifically requested for account-to-account transfers.
          updatedAccounts[idx].balance += newOffset;
        }
      }

      // 3. Batch update changed accounts
      updatedAccounts.forEach(newAcc => {
        const oldAcc = accounts.find(a => a.id === newAcc.id);
        if (oldAcc && Math.abs(oldAcc.balance - newAcc.balance) > 0.001) {
          batch.update(doc(db, "users", user.uid, "accounts", newAcc.id!), { balance: newAcc.balance });
        }
      });

      // 4. Update Profile
      const originalOffset = original.type === "income" ? original.amount : (original.type === "expense" ? -original.amount : 0);
      const updatedOffset = updated.type === "income" ? updated.amount : (updated.type === "expense" ? -updated.amount : 0);
      const profileBalanceDiff = updatedOffset - originalOffset;

      const profileUpdates: any = {
        balance: profile.balance + profileBalanceDiff,
        lastActive: Timestamp.now()
      };

      // Handle Cash Balance Coupling
      const totalAccountBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
      const currentCash = profile.cashBalance ?? (profile.balance - totalAccountBalance);
      let cashDiff = 0;

      // Revert original if it was cash
      if (original.type !== 'transfer' && !original.accountId) {
        cashDiff -= originalOffset;
      }
      // Apply updated if it is cash
      if (updated.type !== 'transfer' && !updated.accountId) {
        cashDiff += updatedOffset;
      }

      if (cashDiff !== 0 || profile.cashBalance === undefined) {
        profileUpdates.cashBalance = currentCash + cashDiff;
      }

      batch.update(doc(db, "users", user.uid), profileUpdates);

      // 5. Update Transaction Record
      const transDoc = doc(db, "users", user.uid, "transactions", updated.id);
      batch.update(transDoc, {
        amount: updated.amount,
        category: updated.category,
        note: updated.note,
        type: updated.type,
        timestamp: updated.timestamp,
        accountId: updated.accountId || null,
        toAccountId: updated.toAccountId || null
      });

      await batch.commit();
      setEditingTransaction(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/transactions/${updated.id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-app-primary"
        >
          <Sparkles size={48} />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-100 rounded-[2.5rem] p-8 max-w-md w-full text-center space-y-6 shadow-xl shadow-slate-200"
        >
          <div className="inline-flex p-4 rounded-full bg-app-primary/10 text-app-primary mb-2">
            <TrendingUp size={48} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">布丁帳本</h1>
          <p className="text-slate-400">
            開始記錄生活點滴，每一筆支出與收入都是成長的足跡。
          </p>
          <button
            onClick={() => loginWithGoogle()}
            className="w-full bg-app-primary text-app-accent font-bold py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-app-primary/20"
          >
            使用 Google 帳號登入
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-slate-50 flex flex-col items-center">
      {/* Mobile-centric Container */}
      <div className="w-full max-w-md h-full bg-white shadow-xl shadow-slate-200 flex flex-col relative overflow-hidden">
        {isOffline && (
          <div className="bg-amber-500 text-white text-[11px] font-bold py-1.5 px-4 text-center tracking-wide flex items-center justify-center gap-1.5 z-50 shadow-sm shrink-0">
            <AlertCircle size={12} />
            <span>目前為離線模式，變更將在重新連線後同步</span>
          </div>
        )}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`absolute top-4 left-4 right-4 z-[100] p-4 rounded-2xl shadow-xl flex items-center gap-3 ${notification.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                }`}
            >
              <AlertCircle size={20} />
              <p className="text-sm font-bold">{notification.message}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        {!isTabLoading && (activeTab === "history" || activeTab === "stats") && (
          <header className="app-header">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const [y, m] = viewMonth.split('-').map(Number);
                    const d = new Date(y, m - 2, 1);
                    setViewMonth(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
                  }}
                  className="p-1 hover:bg-black/10 rounded-full transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="relative">
                  <div
                    className="flex items-center gap-2 bg-black/10 px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-transform relative overflow-hidden"
                  >
                    <span>{viewMonth.split('-')[0]}</span>
                    <div className="w-px h-3 bg-black/20 mx-1" />
                    <span className="text-sm">{viewMonth.split('-')[1]}</span>
                    <input
                      ref={viewMonthRef}
                      type="month"
                      value={viewMonth}
                      onChange={(e) => setViewMonth(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    const [y, m] = viewMonth.split('-').map(Number);
                    const d = new Date(y, m, 1);
                    setViewMonth(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
                  }}
                  className="p-1 hover:bg-black/10 rounded-full transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {activeTab === 'history' && (
                <button
                  onClick={() => {
                    const now = new Date();
                    const dStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const start = `${dStart.getFullYear()}-${(dStart.getMonth() + 1).toString().padStart(2, '0')}-${dStart.getDate().toString().padStart(2, '0')}`;
                    const end = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
                    setSearchStartDate(start);
                    setSearchEndDate(end);
                    setSearchKeyword("");
                    setSearchCategory(null);
                    setShowSearchModal(true);
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-black/10 text-white active:scale-90 transition-all"
                >
                  <Search size={18} />
                </button>
              )}

              {activeTab === 'stats' && (
                <div className="flex bg-black/10 p-1 rounded-xl">
                  <button
                    onClick={() => setChartType("pie")}
                    className={`p-1.5 rounded-lg transition-all ${chartType === 'pie' ? 'bg-white shadow-sm text-app-accent' : 'text-white/60 hover:text-white'}`}
                  >
                    <LucidePieChart size={16} />
                  </button>
                  <button
                    onClick={() => setChartType("line")}
                    className={`p-1.5 rounded-lg transition-all ${chartType === 'line' ? 'bg-white shadow-sm text-app-accent' : 'text-white/60 hover:text-white'}`}
                  >
                    <LucideLineChart size={16} />
                  </button>
                  <button
                    onClick={() => setChartType("bar")}
                    className={`p-1.5 rounded-lg transition-all ${chartType === 'bar' ? 'bg-white shadow-sm text-app-accent' : 'text-white/60 hover:text-white'}`}
                  >
                    <LucideBarChart size={16} />
                  </button>
                </div>
              )}
            </div>

            {activeTab !== "stats" && (
              <div className="grid grid-cols-2 gap-4 mb-2">
                {(() => {
                  const [y, m] = viewMonth.split('-').map(Number);
                  const filtered = transactions.filter(t => {
                    const d = getSafeDate(t.timestamp);
                    return d.getFullYear() === y && (d.getMonth() + 1) === m;
                  });
                  const expenseTotal = filtered.filter(t => t.type === "expense").reduce((a, b) => a + b.amount, 0);
                  const incomeTotal = filtered.filter(t => t.type === "income").reduce((a, b) => a + b.amount, 0);

                  return (
                    <>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">支出 (Expense)</p>
                        <p className="text-2xl font-mono font-bold">
                          {expenseTotal.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">收入 (Income)</p>
                        <p className="text-2xl font-mono font-bold">
                          {incomeTotal.toLocaleString()}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </header>
        )}

        {/* Main Content Area */}
        <main className={`flex-1 overflow-y-auto px-4 ${(activeTab === "history" || activeTab === "stats") ? "-mt-4" : ""}`}>

          <AnimatePresence mode="wait">
            {isTabLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4"
              >
                <div className="w-10 h-10 border-4 border-slate-100 border-t-slate-800 rounded-full animate-spin" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">載入中...</p>
              </motion.div>
            ) : (
              <>
                {activeTab === "history" && (
                  <motion.div
                    key="history"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-6 pt-6 pb-10"
                  >
                    {Object.keys(groupTransactionsByDate()).length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-16 px-6 text-center bg-white rounded-3xl border border-slate-100 shadow-sm mt-4 relative overflow-hidden"
                      >
                        <div className="absolute -top-10 -left-10 w-24 h-24 bg-amber-100/40 rounded-full blur-xl animate-pulse" />
                        <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-yellow-100/40 rounded-full blur-xl animate-pulse" style={{ animationDelay: '1s' }} />

                        <motion.div
                          animate={{
                            y: [0, -8, 0],
                            rotate: [0, 3, -3, 0]
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 3.5,
                            ease: "easeInOut"
                          }}
                          className="relative flex items-center justify-center w-20 h-20 mb-5 rounded-3xl bg-gradient-to-br from-amber-50 to-yellow-100/50 shadow-inner"
                        >
                          <span className="text-4xl select-none filter drop-shadow-sm">🍮</span>
                          <span className="absolute -top-1.5 -right-1.5 text-lg animate-bounce">✨</span>
                          <span className="absolute -bottom-1 -left-1 text-md" style={{ animationDelay: '0.8s' }}>🎈</span>
                        </motion.div>

                        <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-1 justify-center">
                          {(() => {
                            const [_, m] = viewMonth.split('-').map(Number);
                            return `全新的 ${m} 月`;
                          })()}
                        </h3>
                      </motion.div>
                    ) : (
                      Object.entries(groupTransactionsByDate()).map(([date, items]) => (
                        <div key={date} className="space-y-2">
                          <div className="flex justify-between items-center px-2">
                            <span className="text-[10px] font-bold text-slate-400">{date}</span>
                            <div className="flex gap-4 text-[10px] font-bold text-slate-300">
                              <span>出: {items.filter(i => i.type === "expense").reduce((a, b) => a + b.amount, 0).toLocaleString()}</span>
                              <span>入: {items.filter(i => i.type === "income").reduce((a, b) => a + b.amount, 0).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-50 overflow-hidden shadow-sm">
                            {items.map(t => (
                              <div key={t.id} className="flex items-center justify-between py-2.5 px-4 active:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-lg">
                                    {getCategoryEmoji(t.category, customCategories)}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-bold text-slate-700">
                                        {getCategoryDisplayName(t.category, t.type)}
                                      </p>
                                      <div className="flex items-center gap-1">
                                        {t.accountId && (() => {
                                          const acc = accounts.find(a => a.id === t.accountId);
                                          return (
                                            <span
                                              className="text-[8px] px-1.5 py-0.5 rounded-md text-white font-bold"
                                              style={{ backgroundColor: acc?.color || '#94a3b8' }}
                                            >
                                              {acc?.name || "未知"}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                    {t.note && (
                                      <p className="text-[10px] text-slate-400 mt-0.5">{t.note}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`font-mono font-bold ${t.type === "income" ? "text-emerald-500" : "text-slate-800"}`}>
                                    {t.type === "income" ? "" : "-"}{t.amount.toLocaleString()}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => setEditingTransaction(t)} className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors">
                                      <Pencil size={14} />
                                    </button>
                                    <button onClick={() => setShowDeleteTransactionConfirm(t)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}

                {activeTab === "stats" && (
                  <motion.div
                    key="stats"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="pt-6 space-y-4 pb-10"
                  >
                    <div className="bg-white rounded-[2rem] border border-slate-100 p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="flex bg-slate-100 p-1 rounded-full flex-1">
                          <button
                            onClick={() => setStatsTimeframe("month")}
                            className={`flex-1 py-1 text-[9px] font-bold rounded-full transition-all ${chartType !== 'pie' ? 'opacity-0 pointer-events-none' : (statsTimeframe === "month" ? "bg-white shadow-sm text-app-accent" : "text-slate-400")}`}
                          >月</button>
                          <button
                            onClick={() => setStatsTimeframe("year")}
                            className={`flex-1 py-1 text-[9px] font-bold rounded-full transition-all ${chartType !== 'pie' ? 'bg-white shadow-sm text-app-accent flex-1' : (statsTimeframe === "year" ? "bg-white shadow-sm text-app-accent" : "text-slate-400")}`}
                          >年</button>
                        </div>

                        <div className="flex bg-slate-100 p-1 rounded-full flex-[2]">
                          <button
                            onClick={() => setStatsType("expense")}
                            className={`flex-1 py-1 text-[10px] font-bold rounded-full transition-all flex items-center justify-center gap-1.5 ${statsType === "expense" ? "bg-white shadow-sm text-red-500" : "text-slate-400"}`}
                          >
                            支出
                          </button>
                          <button
                            onClick={() => setStatsType("income")}
                            className={`flex-1 py-1 text-[10px] font-bold rounded-full transition-all flex items-center justify-center gap-1.5 ${statsType === "income" ? "bg-white shadow-sm text-emerald-500" : "text-slate-400"}`}
                          >
                            收入
                          </button>
                        </div>
                      </div>

                      <div className={`${chartType === 'pie' ? 'h-48' : 'h-64'} w-full relative`}>
                        {(() => {
                          const [y, m] = viewMonth.split('-').map(Number);

                          if (chartType === 'line') {
                            // Yearly line chart by category
                            const yearlyTransactions = transactions.filter(t => {
                              const tDate = getSafeDate(t.timestamp);
                              return tDate.getFullYear() === y && t.type === statsType;
                            });

                            const categorySource = statsType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
                            const categories = [
                              ...Object.entries(categorySource),
                              ...customCategories.filter(c => c.type === statsType).map(c => [c.id || c.name, c.name])
                            ];

                            const lineData = Array.from({ length: 12 }, (_, i) => {
                              const monthNum = i + 1;
                              const monthData: any = { name: `${monthNum}月` };
                              categories.forEach(([key]) => {
                                monthData[key] = yearlyTransactions
                                  .filter(t => t.category === key && getSafeDate(t.timestamp).getMonth() === i)
                                  .reduce((acc, curr) => acc + curr.amount, 0);
                              });
                              return monthData;
                            });

                            const activeCategories = categories.filter(([key]) =>
                              yearlyTransactions.some(t => t.category === key)
                            );

                            if (yearlyTransactions.length === 0) {
                              return (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                                  <LucideLineChart size={32} className="mb-2 opacity-20" />
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">尚無年報資料</p>
                                </div>
                              );
                            }

                            return (
                              <ResponsiveContainer width="100%" height="100%">
                                <ReLineChart data={lineData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  <XAxis interval={0} dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                                  <Tooltip
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        return (
                                          <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-2xl min-w-[120px]">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{payload[0].payload.name}</p>
                                            <div className="space-y-1.5">
                                              {[...payload].sort((a: any, b: any) => b.value - a.value).slice(0, 5).map((entry: any, index: number) => {
                                                const catName = categories.find(([k]) => k === entry.dataKey)?.[1] || entry.dataKey;
                                                return (entry.value > 0 &&
                                                  <div key={`tip-${index}`} className="flex justify-between items-center gap-4">
                                                    <div className="flex items-center gap-1.5">
                                                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                                      <span className="text-[10px] font-bold text-slate-600">{catName}</span>
                                                    </div>
                                                    <span className="text-[10px] font-mono font-bold text-slate-800">{Number(entry.value).toLocaleString()}</span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  {activeCategories.map(([key, label], index) => {
                                    if (hiddenChartCategories.has(key)) return null;
                                    return (
                                      <Line
                                        key={key}
                                        type="monotone"
                                        dataKey={key}
                                        name={label}
                                        stroke={CHART_COLORS[index % CHART_COLORS.length]}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, strokeWidth: 0 }}
                                      />
                                    );
                                  })}
                                </ReLineChart>
                              </ResponsiveContainer>
                            );
                          }

                          if (chartType === 'bar') {
                            // Yearly bar chart: monthly totals
                            const yearlyTransactions = transactions.filter(t => {
                              const tDate = getSafeDate(t.timestamp);
                              return tDate.getFullYear() === y && t.type === statsType;
                            });

                            const barData = Array.from({ length: 12 }, (_, i) => {
                              const monthNum = i + 1;
                              return {
                                name: `${monthNum}月`,
                                amount: yearlyTransactions
                                  .filter(t => getSafeDate(t.timestamp).getMonth() === i && !hiddenChartCategories.has(t.category))
                                  .reduce((acc, curr) => acc + curr.amount, 0)
                              };
                            });

                            if (yearlyTransactions.length === 0) {
                              return (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                                  <LucideBarChart size={32} className="mb-2 opacity-20" />
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">尚無年報資料</p>
                                </div>
                              );
                            }

                            return (
                              <ResponsiveContainer width="100%" height="100%">
                                <ReBarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  <XAxis interval={0} dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                                  <Tooltip
                                    cursor={{ fill: '#f8fafc', radius: 10 }}
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        return (
                                          <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-2xl">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{payload[0].payload.name}</p>
                                            <p className="text-sm font-mono font-bold text-slate-800">
                                              {Number(payload[0].value).toLocaleString()}
                                            </p>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <Bar
                                    dataKey="amount"
                                    fill={statsType === 'expense' ? '#ef4444' : '#10b981'}
                                    radius={[6, 6, 0, 0]}
                                    barSize={20}
                                  />
                                </ReBarChart>
                              </ResponsiveContainer>
                            );
                          }

                          // Default Pie Chart logic
                          const timeframeTransactions = transactions.filter(t => {
                            const tDate = getSafeDate(t.timestamp);
                            return statsTimeframe === "month"
                              ? (tDate.getMonth() + 1 === m && tDate.getFullYear() === y)
                              : tDate.getFullYear() === y;
                          });

                          const categorySource = statsType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

                          const chartData = [
                            ...Object.entries(categorySource),
                            ...customCategories.filter(c => c.type === statsType).map(c => [c.id || c.name, c.name])
                          ]
                            .map(([key, val]) => ({
                              name: val,
                              value: timeframeTransactions
                                .filter(t => t.category === key && t.type === statsType)
                                .reduce((acc, curr) => acc + curr.amount, 0)
                            }))
                            .filter(d => d.value > 0)
                            .sort((a, b) => b.value - a.value);

                          const totalAmount = chartData.reduce((acc, curr) => acc + curr.value, 0);

                          return (
                            <>
                              {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <RePieChart>
                                    <Pie
                                      data={chartData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={60}
                                      outerRadius={80}
                                      paddingAngle={5}
                                      dataKey="value"
                                    >
                                      {chartData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                          return (
                                            <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-2xl">
                                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{payload[0].name}</p>
                                              <p className="text-sm font-mono font-bold text-slate-800">
                                                {Number(payload[0].value).toLocaleString()}
                                              </p>
                                              <p className="text-[8px] text-slate-300 mt-1">
                                                佔比 {((Number(payload[0].value) / totalAmount) * 100).toFixed(1)}%
                                              </p>
                                            </div>
                                          );
                                        }
                                        return null;
                                      }}
                                    />
                                  </RePieChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                    <LucidePieChart size={32} />
                                  </div>
                                  <p className="text-xs font-bold">尚無{statsType === "income" ? "收入" : "支出"}數據</p>
                                </div>
                              )}
                              {chartData.length > 0 && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{statsType === "income" ? "總收入" : "總支出"}</p>
                                  <p className="text-xl font-mono font-bold text-slate-800">
                                    {totalAmount.toLocaleString()}
                                  </p>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(() => {
                        const [y, m] = viewMonth.split('-').map(Number);
                        const timeframeTransactions = transactions.filter(t => {
                          const tDate = getSafeDate(t.timestamp);
                          return statsTimeframe === "month"
                            ? (tDate.getMonth() + 1 === m && tDate.getFullYear() === y)
                            : tDate.getFullYear() === y;
                        });

                        const categorySource = statsType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

                        const summaryData = [
                          ...Object.entries(categorySource),
                          ...customCategories.filter(c => c.type === statsType).map(c => [c.id || c.name, c.name])
                        ]
                          .map(([key, val]) => ({
                            id: key,
                            name: val,
                            value: timeframeTransactions
                              .filter(t => t.category === key && t.type === statsType)
                              .reduce((acc, curr) => acc + curr.amount, 0)
                          }))
                          .filter(d => d.value > 0)
                          .sort((a, b) => b.value - a.value);

                        const totalAmount = summaryData.reduce((acc, curr) => acc + curr.value, 0);

                        return (
                          <>
                            {(chartType === 'line' || chartType === 'bar') && summaryData.length > 0 && (
                              <div className="flex justify-end gap-3 px-2 mb-2">
                                <button
                                  onClick={() => setHiddenChartCategories(new Set())}
                                  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider"
                                >
                                  全選
                                </button>
                                <button
                                  onClick={() => setHiddenChartCategories(new Set(summaryData.map(d => d.id)))}
                                  className="text-[10px] font-bold text-slate-400 hover:text-slate-500 uppercase tracking-wider"
                                >
                                  取消全選
                                </button>
                              </div>
                            )}
                            {summaryData.map((item, idx) => {
                              const isHidden = hiddenChartCategories.has(item.id);
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => {
                                    setSelectedStatsCategory({
                                      id: item.id,
                                      name: item.name,
                                      emoji: getCategoryEmoji(item.id, customCategories),
                                      type: statsType
                                    });
                                  }}
                                  className={`bg-white py-3.5 px-5 rounded-[1.5rem] border border-slate-100 flex items-center justify-between shadow-sm active:scale-[0.98] transition-all cursor-pointer hover:border-slate-200/80 ${isHidden ? 'opacity-50' : ''}`}
                                >
                                  <div className="flex items-center gap-3">
                                    {(chartType === 'line' || chartType === 'bar') && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const newHidden = new Set(hiddenChartCategories);
                                          if (newHidden.has(item.id)) {
                                            newHidden.delete(item.id);
                                          } else {
                                            newHidden.add(item.id);
                                          }
                                          setHiddenChartCategories(newHidden);
                                        }}
                                        className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors mr-0.5"
                                        title={isHidden ? "顯示於圖表" : "隱藏於圖表"}
                                      >
                                        {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                      </button>
                                    )}
                                    <div
                                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-inner flex-shrink-0"
                                      style={{ backgroundColor: `${CHART_COLORS[idx % CHART_COLORS.length]}20` }}
                                    >
                                      {getCategoryEmoji(item.id, customCategories)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-slate-700">{item.name}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                          <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(item.value / totalAmount) * 100}%` }}
                                            className="h-full"
                                            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                                          />
                                        </div>
                                        <span className="text-[8px] font-bold text-slate-400">{Math.round((item.value / totalAmount) * 100)}%</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right flex items-center gap-2">
                                    <p className="text-sm font-mono font-bold text-slate-800">{item.value.toLocaleString()}</p>
                                    <span className="text-[10px] text-slate-300 font-bold select-none">❯</span>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  </motion.div>
                )}

                {activeTab === "accounts" && (
                  <motion.div
                    key="accounts"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="pt-5 space-y-6 pb-10"
                  >
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-slate-800">銀行帳戶管理</h2>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[10px] font-bold rounded-md">
                          {accounts.length}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setNewAccountName("");
                          setNewBankName("");
                          setNewBalance("");
                          setShowAddAccount(true);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-app-primary text-app-accent rounded-full text-[10px] font-bold shadow-lg shadow-app-primary/20 active:scale-95 transition-all"
                      >
                        <Plus size={14} /> 新增帳戶
                      </button>
                    </div>

                    {/* Total Balance Card - Main Visual */}
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-[2rem] p-8 text-white shadow-xl shadow-slate-200 text-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-6 opacity-10">
                        <ClipboardList size={64} />
                      </div>
                      <div className="absolute top-0 right-0 p-4">
                        <button
                          onClick={async () => {
                            if (user) {
                              await updateDoc(doc(db, "users", user.uid), {
                                isGlobalHidden: !isGlobalHidden
                              });
                            }
                          }}
                          className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all backdrop-blur-md active:scale-95"
                        >
                          {isGlobalHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-[11px] font-bold opacity-60 uppercase tracking-[0.2em] mb-2">存款總額 · Total Balance</p>
                      <h3 className="text-3xl font-mono font-bold tracking-tight">
                        {isGlobalHidden ? "****" : accounts.reduce((acc, a) => acc + a.balance, 0).toLocaleString()}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {accounts.map((acc, index) => (
                        <motion.div
                          key={acc.id}
                          layout
                          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-transform"
                          onClick={() => {
                            setShowAccountDetail(acc);
                            setAccountDetailPage(1);
                            setAccSearchKeyword("");
                            setAccSearchCategory(null);
                            const now = new Date();
                            const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                            setAccSearchStartDate(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`);
                            setAccSearchEndDate(`${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`);
                            setAccIsSearchFocused(false);
                          }}
                        >
                          <div className="absolute top-0 right-0 p-2 flex gap-1 items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAccount(acc);
                                setNewAccountName(acc.name);
                                setNewBankName(acc.bankName);
                                setNewBalance(acc.balance.toString());
                                setNewAccountColor(acc.color);
                              }}
                              className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                              title="修改帳戶"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(acc.id!); }}
                              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                            <div className="flex flex-col gap-1 ml-1 bg-slate-50 rounded-lg p-0.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                              <button
                                disabled={index === 0}
                                onClick={(e) => { e.stopPropagation(); handleMoveAccount(acc.id!, 'up'); }}
                                className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20"
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                disabled={index === accounts.length - 1}
                                onClick={(e) => { e.stopPropagation(); handleMoveAccount(acc.id!, 'down'); }}
                                className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20"
                              >
                                <ChevronDown size={12} />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 mb-3">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-inner font-bold"
                              style={{ backgroundColor: `${acc.color}20`, color: acc.color, border: `1px solid ${acc.color}40` }}
                            >
                              {acc.bankName.slice(0, 1) || "🏦"}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-800 text-sm">{acc.name}</h4>
                              <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">{acc.bankName}</p>
                            </div>
                          </div>

                          <div className="flex justify-between items-end">
                            <p className="text-xl font-mono font-bold text-slate-700">
                              {isGlobalHidden ? "****" : acc.balance.toLocaleString()}
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowCashTransfer({ type: 'withdraw', account: acc });
                                  setCashTransferAmount("");
                                }}
                                className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-slate-200 transition-colors"
                              >
                                提款
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowCashTransfer({ type: 'deposit', account: acc });
                                  setCashTransferAmount("");
                                }}
                                className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-lg hover:bg-emerald-100 transition-colors"
                              >
                                存款
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}

                      {accounts.length === 0 && (
                        <div className="py-20 text-center">
                          <div className="w-16 h-16 bg-slate-50 rounded-3xl mx-auto flex items-center justify-center text-slate-200 mb-4">
                            <Plus size={32} />
                          </div>
                          <p className="text-sm font-bold text-slate-300">尚未建立帳戶</p>
                          <p className="text-[10px] text-slate-300">點擊上方按鈕開始管理您的銀行資產</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === "profile" && (
                  <motion.div
                    key="profile"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="pt-5 space-y-6 pb-10"
                  >
                    <div className="text-center">
                      <div className="w-24 h-24 bg-app-primary rounded-3xl mx-auto shadow-lg shadow-app-primary/20 flex items-center justify-center text-4xl mb-4 overflow-hidden">
                        {profile?.photoURL ? (
                          <img src={profile.photoURL} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-app-accent">👤</span>
                        )}
                      </div>
                      <h2 className="text-xl font-bold text-slate-800">{profile?.displayName || "新用戶"}</h2>
                      <p className="text-sm text-slate-400">{user?.email}</p>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-50 shadow-sm">
                      <div className="p-4 flex items-center justify-between">
                        <span className="text-base font-bold text-slate-600">現金餘額</span>
                        {(() => {
                          const totalAccountBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
                          const cashBalance = profile?.cashBalance ?? ((profile?.balance || 0) - totalAccountBalance);
                          return (
                            <span className={`text-xl font-mono font-bold ${cashBalance < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                              {cashBalance.toLocaleString()}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-600">上次活動</span>
                        <span className="text-sm font-bold text-slate-400">
                          {profile?.lastActive ? getSafeDate(profile.lastActive).toLocaleDateString() : "-"}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-800">分類項目管理</h3>
                        <div className="flex bg-slate-50 p-1 rounded-xl">
                          <button
                            onClick={() => setCatManageType("expense")}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${catManageType === "expense" ? "bg-white shadow-sm text-red-500" : "text-slate-400"}`}
                          >支出</button>
                          <button
                            onClick={() => setCatManageType("income")}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${catManageType === "income" ? "bg-white shadow-sm text-emerald-500" : "text-slate-400"}`}
                          >收入</button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setNewCatName("");
                            setNewCatEmoji("✨");
                            setShowAddCategory(catManageType);
                          }}
                          className={`w-full text-xs font-bold py-3.5 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 ${catManageType === "expense" ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500"}`}
                        >
                          <Plus size={16} /> 新增{catManageType === "expense" ? "支出" : "收入"}分類
                        </button>
                      </div>

                      <div className="space-y-3">
                        {/* Default Categories Section */}
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-2 gap-2">
                            {(() => {
                              const allFixedIds = Object.keys(catManageType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES);
                              const savedOrder = catManageType === 'expense' ? profile?.expenseCategoryOrder : profile?.incomeCategoryOrder;
                              let sortedFixedIds = allFixedIds;
                              if (savedOrder && savedOrder.length > 0) {
                                sortedFixedIds = [...allFixedIds].sort((a, b) => {
                                  const ai = savedOrder.indexOf(a);
                                  const bi = savedOrder.indexOf(b);
                                  if (ai === -1 && bi === -1) return 0;
                                  if (ai === -1) return 1;
                                  if (bi === -1) return -1;
                                  return ai - bi;
                                });
                              }
                              const labels = catManageType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

                              return sortedFixedIds.map((id, index) => (
                                <div key={id} className="flex flex-col gap-1 p-1.5 px-2 bg-slate-50 rounded-xl border border-slate-100/80 hover:bg-slate-100/50 hover:shadow-xs transition-all duration-200">
                                  <div className="flex items-center gap-1.5 overflow-hidden w-full">
                                    <span className="text-base flex-shrink-0">{getCategoryEmoji(id)}</span>
                                    <span className="text-xs font-semibold text-slate-700 truncate">{labels[id]}</span>
                                  </div>
                                  <div className="flex items-center justify-end gap-1 w-full mt-0.5">
                                    <button
                                      onClick={() => toggleCategoryVisibility(id)}
                                      className={`p-1 rounded-md transition-colors hover:bg-slate-200/50 ${profile?.hiddenCategoryIds?.includes(id) ? 'text-blue-500' : 'text-slate-400 hover:text-blue-500'}`}
                                    >
                                      {profile?.hiddenCategoryIds?.includes(id) ? <EyeOff size={13} /> : <Eye size={13} />}
                                    </button>
                                    <div className="flex bg-slate-200/40 rounded-md p-0.5 ml-0.5 gap-0.5">
                                      <button
                                        disabled={index === 0}
                                        onClick={() => handleMoveFixedCategory(id, catManageType, 'up')}
                                        className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-20 transition-all"
                                      >
                                        <ChevronUp size={12} />
                                      </button>
                                      <button
                                        disabled={index === sortedFixedIds.length - 1}
                                        onClick={() => handleMoveFixedCategory(id, catManageType, 'down')}
                                        className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-20 transition-all"
                                      >
                                        <ChevronDown size={12} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>

                        {/* Custom Categories Section */}
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider ml-1">自訂分類</p>
                          {customCategories.filter(c => c.type === catManageType).length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {(() => {
                                const filteredCats = customCategories.filter(c => c.type === catManageType);
                                return filteredCats.map((cat, index) => (
                                  <div key={cat.id} className="flex flex-col gap-1 p-1.5 px-2 bg-slate-50 rounded-xl border border-slate-100/80 hover:bg-slate-100/50 hover:shadow-xs transition-all duration-200">
                                    <div
                                      onClick={() => {
                                        setNewCatName(cat.name);
                                        setNewCatEmoji(cat.emoji);
                                        setEditingCategory(cat);
                                      }}
                                      className="flex items-center gap-1.5 overflow-hidden cursor-pointer hover:opacity-85 active:scale-95 transition-all w-full"
                                      title="修改分類名稱"
                                    >
                                      <span className="text-base flex-shrink-0">{cat.emoji}</span>
                                      <span className="text-xs font-semibold text-slate-700 truncate hover:text-blue-500 transition-colors">{cat.name}</span>
                                    </div>
                                    <div className="flex items-center justify-end gap-1 w-full mt-0.5">
                                      <button
                                        onClick={() => toggleCategoryVisibility(cat.id!)}
                                        className={`p-1 rounded-md transition-colors hover:bg-slate-200/50 ${profile?.hiddenCategoryIds?.includes(cat.id!) ? 'text-blue-500' : 'text-slate-400 hover:text-blue-500'}`}
                                      >
                                        {profile?.hiddenCategoryIds?.includes(cat.id!) ? <EyeOff size={13} /> : <Eye size={13} />}
                                      </button>
                                      <button
                                        onClick={() => {
                                          const hasTransactions = transactions.some(t => t.category === cat.id);
                                          if (hasTransactions) {
                                            setCatHasTransactionsNotice(true);
                                          } else {
                                            setCatHasTransactionsNotice(false);
                                          }
                                          setShowDeleteCatConfirm(cat.id!);
                                        }}
                                        className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                      <div className="flex bg-slate-200/40 rounded-md p-0.5 ml-0.5 gap-0.5">
                                        <button
                                          disabled={index === 0}
                                          onClick={() => handleMoveCategory(cat.id!, 'up')}
                                          className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-20 transition-all"
                                        >
                                          <ChevronUp size={12} />
                                        </button>
                                        <button
                                          disabled={index === filteredCats.length - 1}
                                          onClick={() => handleMoveCategory(cat.id!, 'down')}
                                          className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-20 transition-all"
                                        >
                                          <ChevronDown size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ));
                              })()}
                            </div>
                          ) : (
                            <div className="text-center py-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                              <p className="text-[10px] text-slate-300 italic">尚未建立自訂分類</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 「+」 頁面佈局設定 */}
                    <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-800">「+」 頁面佈局設定</h3>
                        <p className="text-[10px] text-slate-400 font-medium">減少列數可放大分類圖示</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">每列顯示圖示數量</span>
                        <div className="flex bg-slate-50 p-1 rounded-xl">
                          {[3, 4, 5, 6].map((num) => (
                            <button
                              key={num}
                              onClick={async () => {
                                if (user) {
                                  await updateDoc(doc(db, "users", user.uid), {
                                    categoryColumns: num
                                  });
                                }
                              }}
                              className={`w-10 py-1.5 text-xs font-mono font-bold rounded-lg transition-all ${(profile?.categoryColumns || 6) === num
                                ? "bg-white shadow-sm text-app-primary scale-105"
                                : "text-slate-400 hover:text-slate-600"
                                }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => auth.signOut()}
                      className="w-full mt-6 group flex items-center justify-center gap-2 py-4 px-6 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-2xl border border-slate-100 hover:border-red-100 transition-all active:scale-[0.98]"
                    >
                      <LogOut size={16} className="transition-transform group-hover:translate-x-0.5" />
                      <span className="text-sm font-bold tracking-wide">安全登出</span>
                    </button>
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <nav className="pb-[env(safe-area-inset-bottom)] bg-white border-t border-slate-50 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
          <div className="h-16 flex items-center justify-between px-2 w-full">
            <button onClick={() => handleTabChange("history")} className={`nav-item ${activeTab === "history" ? "nav-item-active" : ""}`}>
              <History size={22} strokeWidth={2.5} />
              <span className="text-[9px] font-bold">明細</span>
            </button>
            <button onClick={() => handleTabChange("stats")} className={`nav-item ${activeTab === "stats" ? "nav-item-active" : ""}`}>
              <BarChart3 size={22} strokeWidth={2.5} />
              <span className="text-[9px] font-bold">圖表</span>
            </button>

            <div className="flex-1 flex justify-center -mt-8">
              <button
                onClick={() => setIsAdding(true)}
                className="w-14 h-14 bg-app-primary rounded-full shadow-lg shadow-app-primary/40 flex items-center justify-center text-app-accent active:scale-95 transition-transform"
              >
                <Plus size={28} strokeWidth={3} />
              </button>
            </div>

            <button onClick={() => handleTabChange("accounts")} className={`nav-item ${activeTab === "accounts" ? "nav-item-active" : ""}`}>
              <ClipboardList size={22} strokeWidth={2.5} />
              <span className="text-[9px] font-bold">帳戶</span>
            </button>
            <button onClick={() => handleTabChange("profile")} className={`nav-item ${activeTab === "profile" ? "nav-item-active" : ""}`}>
              <UserIcon size={22} strokeWidth={2.5} />
              <span className="text-[9px] font-bold">我的</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Delete Transaction Confirmation Modal */}
      <AnimatePresence>
        {showDeleteTransactionConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-800">確定要刪除這筆紀錄？</h3>
                <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getCategoryEmoji(showDeleteTransactionConfirm.category, customCategories)}</span>
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-700">{getCategoryDisplayName(showDeleteTransactionConfirm.category, showDeleteTransactionConfirm.type)}</p>
                      {showDeleteTransactionConfirm.note && (
                        <p className="text-[10px] text-slate-400">{showDeleteTransactionConfirm.note}</p>
                      )}
                    </div>
                  </div>
                  <p className={`font-mono font-bold ${showDeleteTransactionConfirm.type === 'income' ? 'text-emerald-500' : 'text-slate-800'}`}>
                    {showDeleteTransactionConfirm.type === 'income' ? '' : '-'}{showDeleteTransactionConfirm.amount.toLocaleString()}
                  </p>
                </div>
                <p className="text-sm text-slate-400 px-2">
                  刪除後將無法恢復，對應的帳戶餘額也會自動調整。
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowDeleteTransactionConfirm(null)}
                  className="py-3.5 rounded-2xl font-bold text-slate-400 bg-slate-50 active:scale-95 transition-all text-sm"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    const trans = showDeleteTransactionConfirm;
                    setShowDeleteTransactionConfirm(null);
                    await handleDeleteTransaction(trans);
                  }}
                  className="py-3.5 rounded-2xl font-bold text-white bg-red-500 shadow-lg shadow-red-200 active:scale-95 transition-all text-sm"
                >
                  確認刪除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Transaction / Keypad Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[60] flex flex-col bg-white">
            <header className="px-6 pt-5 pb-2 flex items-center justify-between">
              <button
                onClick={resetEntry}
                className={`text-slate-400 font-bold uppercase tracking-wider transition-all ${(profile?.categoryColumns === 3) ? "text-base" :
                  (profile?.categoryColumns === 4) ? "text-sm" : "text-xs"
                  }`}
              >
                取消
              </button>
              <div className={`flex bg-slate-100 p-1 rounded-full transition-all ${(profile?.categoryColumns === 3) ? "w-64" :
                (profile?.categoryColumns === 4) ? "w-56" : "w-48"
                }`}>
                <button
                  onClick={() => {
                    setTransactionType("expense");
                    setSelectedCategory("Food");
                  }}
                  className={`flex-1 py-1 font-bold rounded-full transition-all ${transactionType === "expense" ? "bg-white shadow-sm text-red-500" : "text-slate-400"
                    } ${(profile?.categoryColumns === 3) ? "text-xs py-2" :
                      (profile?.categoryColumns === 4) ? "text-[11px] py-1.5" : "text-[9px]"
                    }`}
                >支出</button>
                <button
                  onClick={() => {
                    setTransactionType("income");
                    setSelectedCategory("Salary");
                  }}
                  className={`flex-1 py-1 font-bold rounded-full transition-all ${transactionType === "income" ? "bg-white shadow-sm text-emerald-500" : "text-slate-400"
                    } ${(profile?.categoryColumns === 3) ? "text-xs py-2" :
                      (profile?.categoryColumns === 4) ? "text-[11px] py-1.5" : "text-[9px]"
                    }`}
                >收入</button>
                <button
                  onClick={() => {
                    setTransactionType("transfer");
                    setSelectedCategory("Others");
                    setNoteValue("");
                    setSelectedFromAccountId(null);
                    setSelectedToAccountId(null);
                  }}
                  className={`flex-1 py-1 font-bold rounded-full transition-all ${transactionType === "transfer" ? "bg-white shadow-sm text-blue-500" : "text-slate-400"
                    } ${(profile?.categoryColumns === 3) ? "text-xs py-2" :
                      (profile?.categoryColumns === 4) ? "text-[11px] py-1.5" : "text-[9px]"
                    }`}
                >轉帳</button>
              </div>
              <div className="w-8" />
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-2">
              {transactionType === "transfer" ? (
                <div className="flex flex-col gap-4 py-2 w-full max-w-md mx-auto">
                  {/* FROM ACCOUNT BLOCK */}
                  <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 transition-all duration-300">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 tracking-wider">
                      <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                        <ArrowUpRight size={13} />
                      </div>
                      <span>從此帳戶轉出</span>
                      {selectedFromAccountId && (
                        <span className="ml-auto text-[10px] bg-red-100/50 text-red-600 px-2.5 py-0.5 rounded-full font-bold">
                          已選擇
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {accounts.map(acc => {
                        const isSelected = selectedFromAccountId === acc.id;
                        const isDisabled = selectedToAccountId === acc.id;
                        return (
                          <button
                            key={`from-${acc.id}`}
                            disabled={isDisabled}
                            onClick={() => setSelectedFromAccountId(acc.id!)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 ${isSelected
                              ? 'shadow-md shadow-slate-200 scale-105 z-10'
                              : isDisabled
                                ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed opacity-30'
                                : 'bg-white text-slate-600 border-slate-100 hover:border-slate-200 active:scale-95'
                              }`}
                            style={isSelected ? { backgroundColor: acc.color, color: '#fff', borderColor: acc.color } : {}}
                          >
                            {acc.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* TO ACCOUNT BLOCK */}
                  <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 transition-all duration-300">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 tracking-wider">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                        <ArrowDownLeft size={13} />
                      </div>
                      <span>轉入此帳戶</span>
                      {selectedToAccountId && (
                        <span className="ml-auto text-[10px] bg-emerald-100/50 text-emerald-600 px-2.5 py-0.5 rounded-full font-bold">
                          已選擇
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {accounts.map(acc => {
                        const isSelected = selectedToAccountId === acc.id;
                        const isDisabled = selectedFromAccountId === acc.id;
                        return (
                          <button
                            key={`to-${acc.id}`}
                            disabled={isDisabled}
                            onClick={() => setSelectedToAccountId(acc.id!)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 ${isSelected
                              ? 'shadow-md shadow-slate-200 scale-105 z-10'
                              : isDisabled
                                ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed opacity-30'
                                : 'bg-white text-slate-600 border-slate-100 hover:border-slate-200 active:scale-95'
                              }`}
                            style={isSelected ? { backgroundColor: acc.color, color: '#fff', borderColor: acc.color } : {}}
                          >
                            {acc.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Category Grid */}
                  <div className={`grid gap-x-1 gap-y-6 pb-12 ${(profile?.categoryColumns === 3) ? "grid-cols-3" :
                    (profile?.categoryColumns === 4) ? "grid-cols-4" :
                      (profile?.categoryColumns === 5) ? "grid-cols-5" : "grid-cols-6"
                    }`}>
                    {/* Built-in Categories */}
                    {getSortedFixedCategories(transactionType)
                      .filter(([id]) => !(profile?.hiddenCategoryIds || []).includes(id))
                      .map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => setSelectedCategory(id)}
                          className={`flex flex-col items-center gap-2 transition-all active:scale-90 ${selectedCategory === id ? "scale-105" : "opacity-80"}`}
                        >
                          <div className={`rounded-full flex items-center justify-center bg-slate-50 border border-slate-100 transition-all ${selectedCategory === id ? "bg-app-primary/10 border-app-primary shadow-sm" : ""
                            } ${(profile?.categoryColumns === 3) ? "w-16 h-16 text-3xl" :
                              (profile?.categoryColumns === 4) ? "w-13 h-13 text-2xl" :
                                (profile?.categoryColumns === 5) ? "w-11 h-11 text-xl" : "w-9 h-9 text-lg"
                            }`}>
                            {getCategoryEmoji(id, customCategories)}
                          </div>
                          <span className={`font-bold whitespace-nowrap overflow-hidden text-ellipsis w-full text-center ${selectedCategory === id ? "text-app-primary" : "text-slate-500"
                            } ${(profile?.categoryColumns === 3) ? "text-[11px]" :
                              (profile?.categoryColumns === 4) ? "text-[10px]" : "text-[9px]"
                            }`}>{label}</span>
                        </button>
                      ))}

                    {/* Custom Categories */}
                    {customCategories
                      .filter(c => c.type === transactionType && !(profile?.hiddenCategoryIds || []).includes(c.id!))
                      .map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id!)}
                          className={`flex flex-col items-center gap-2 transition-all active:scale-90 ${selectedCategory === cat.id ? "scale-105" : "opacity-80"}`}
                        >
                          <div className={`rounded-full flex items-center justify-center bg-slate-50 border border-slate-100 transition-all ${selectedCategory === cat.id ? "bg-app-primary/10 border-app-primary shadow-sm" : ""
                            } ${(profile?.categoryColumns === 3) ? "w-16 h-16 text-3xl" :
                              (profile?.categoryColumns === 4) ? "w-13 h-13 text-2xl" :
                                (profile?.categoryColumns === 5) ? "w-11 h-11 text-xl" : "w-9 h-9 text-lg"
                            }`}>
                            {cat.emoji}
                          </div>
                          <span className={`font-bold whitespace-nowrap overflow-hidden text-ellipsis w-full text-center ${selectedCategory === cat.id ? "text-app-primary" : "text-slate-500"
                            } ${(profile?.categoryColumns === 3) ? "text-[11px]" :
                              (profile?.categoryColumns === 4) ? "text-[10px]" : "text-[9px]"
                            }`}>{cat.name}</span>
                        </button>
                      ))}
                  </div>
                </>
              )}
            </main>

            {/* Input & Keypad */}
            <div className="bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
              {/* Account Selector */}
              {transactionType !== "transfer" && (
                <div className="px-6 py-3 border-b border-slate-50 flex items-center gap-3 overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setSelectedAccountId(null)}
                    className={`flex-shrink-0 px-4 py-2 rounded-2xl text-[10px] font-bold transition-all border ${!selectedAccountId ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                  >
                    不連動帳戶
                  </button>
                  {accounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => setSelectedAccountId(acc.id!)}
                      className={`flex-shrink-0 px-4 py-2 rounded-2xl text-[10px] font-bold transition-all border flex items-center gap-2 ${selectedAccountId === acc.id ? 'bg-app-primary text-app-accent border-app-primary shadow-md shadow-slate-200 scale-105' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                      style={selectedAccountId === acc.id ? { backgroundColor: acc.color, color: '#fff', borderColor: acc.color } : {}}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedAccountId === acc.id ? '#fff' : acc.color }} />
                      {acc.name}
                    </button>
                  ))}
                </div>
              )}



              <div className="px-6 py-4 flex items-center justify-between">
                {transactionType !== "transfer" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">備註:</span>
                    <input
                      type="search"
                      value={noteValue}
                      onChange={(e) => setNoteValue(e.target.value)}
                      placeholder="點擊輸入備註..."
                      className="bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">轉帳金額</span>
                  </div>
                )}
                <span className="text-3xl font-mono font-bold text-slate-800">
                  {keypadValue || "0"}
                </span>
              </div>

              {/* 常用片語 (動態提取) */}
              {recentPhrases.length > 0 && transactionType !== "transfer" && (
                <div className="px-6 pb-3 overflow-x-auto no-scrollbar flex gap-2">
                  {recentPhrases.map(phrase => (
                    <button
                      key={phrase}
                      onClick={() => setNoteValue(prev => prev ? `${prev} ${phrase}` : phrase)}
                      className="flex-shrink-0 px-2.5 py-1 bg-slate-50 text-[10px] font-bold text-slate-400 rounded-lg border border-slate-100 active:scale-95 transition-all"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-4 border-t border-slate-50">
                {["7", "8", "9", "today"].map(key => (
                  key === "today" ? (
                    <div
                      key={key}
                      className="keypad-button flex items-center justify-center gap-1.5 cursor-pointer active:bg-slate-50 transition-colors relative"
                    >
                      <Calendar size={18} className="text-app-primary" />
                      <span className="text-xs font-bold text-slate-600">
                        {(() => {
                          const today = getLocalISODate();
                          if (selectedDate === today) return "今日";
                          const parts = selectedDate.split("-");
                          return `${parts[1]}/${parts[2]}`;
                        })()}
                      </span>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedDate(val || getLocalISODate());
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  ) : (
                    <button
                      key={key}
                      onClick={() => handleKeypadPress(key)}
                      className="keypad-button"
                    >
                      {key}
                    </button>
                  )
                ))}
                {["4", "5", "6", "+"].map(key => (
                  <button key={key} onClick={() => handleKeypadPress(key)} className="keypad-button">{key}</button>
                ))}
                {["1", "2", "3", "-"].map(key => (
                  <button key={key} onClick={() => handleKeypadPress(key)} className="keypad-button">{key}</button>
                ))}
                {["0", "00", "del", "done"].map(key => (
                  <button
                    key={key}
                    onClick={() => key === "done" ? handleEquals() : handleKeypadPress(key)}
                    className={`keypad-button ${key === "done" ? "!bg-yellow-400 !text-slate-900 border-yellow-500 shadow-lg shadow-yellow-400/20" : ""}`}
                  >
                    {key === "del" ? <Delete size={20} /> : key === "done" ? "=" : key}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingTransaction && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">
                  修改收支紀錄
                </h2>
                <button
                  onClick={() => setEditingTransaction(null)}
                  className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">金額</label>
                  <input
                    type="search"
                    inputMode="decimal"
                    value={editingTransaction.amount}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, amount: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-2xl font-mono font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-app-primary/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">分類</label>
                  <div className="grid grid-cols-4 gap-2 max-h-[120px] overflow-y-auto pr-1">
                    {/* Built-in */}
                    {getSortedFixedCategories(editingTransaction.type as 'expense' | 'income')
                      .filter(([id]) => !(profile?.hiddenCategoryIds || []).includes(id) || editingTransaction.category === id)
                      .map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setEditingTransaction({ ...editingTransaction, category: key })}
                          className={`p-2 rounded-xl text-[10px] font-bold transition-all border ${editingTransaction.category === key
                            ? "bg-app-primary text-app-accent border-app-primary shadow-lg shadow-app-primary/20"
                            : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                            }`}
                        >
                          {label}
                        </button>
                      ))}
                    {/* Custom */}
                    {customCategories
                      .filter(c => c.type === editingTransaction.type && (!(profile?.hiddenCategoryIds || []).includes(c.id!) || editingTransaction.category === c.id))
                      .map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setEditingTransaction({ ...editingTransaction, category: cat.id! })}
                          className={`p-2 rounded-xl text-[10px] font-bold transition-all border ${editingTransaction.category === cat.id
                            ? "bg-app-primary text-app-accent border-app-primary shadow-lg shadow-app-primary/20"
                            : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                            }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">連動帳戶</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    <button
                      onClick={() => setEditingTransaction({ ...editingTransaction, accountId: undefined })}
                      className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-bold border transition-all ${!editingTransaction.accountId ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                    >
                      不連動
                    </button>
                    {accounts.map(acc => (
                      <button
                        key={acc.id}
                        onClick={() => setEditingTransaction({ ...editingTransaction, accountId: acc.id })}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-bold border flex items-center gap-2 transition-all ${editingTransaction.accountId === acc.id ? 'bg-app-primary text-app-accent border-app-primary shadow-md shadow-slate-200 scale-105' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                        style={editingTransaction.accountId === acc.id ? { backgroundColor: acc.color, color: '#fff', borderColor: acc.color } : {}}
                      >
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: editingTransaction.accountId === acc.id ? '#fff' : acc.color }} />
                        {acc.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">日期</label>
                  <div className="relative w-full bg-slate-50 border border-slate-100 rounded-2xl p-3 flex items-center justify-between overflow-hidden">
                    <span className="text-sm font-bold text-slate-600">
                      {(() => {
                        const d = getSafeDate(editingTransaction.timestamp);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        return `${y}-${m}-${day}`;
                      })()}
                    </span>
                    <Calendar size={20} className="text-app-primary" />
                    <input
                      type="date"
                      value={(() => {
                        const d = getSafeDate(editingTransaction.timestamp);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        return `${y}-${m}-${day}`;
                      })()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [y, m, d] = val.split('-').map(Number);
                        const oldDate = getSafeDate(editingTransaction.timestamp);
                        const newDate = new Date(y, m - 1, d, oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds(), oldDate.getMilliseconds());
                        setEditingTransaction({ ...editingTransaction, timestamp: Timestamp.fromDate(newDate) });
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">備註</label>
                  <input
                    type="search"
                    value={editingTransaction.note}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, note: e.target.value })}
                    placeholder="寫點什麼..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-3 text-sm text-slate-600 focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      const nextType: TransactionType =
                        editingTransaction.type === "expense" ? "income" : "expense";
                      setEditingTransaction({ ...editingTransaction, type: nextType });
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-2xl font-bold transition-all border ${editingTransaction.type === "income"
                      ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                      : "bg-red-50 text-red-600 border-red-100"
                      }`}
                  >
                    {editingTransaction.type === "income" ? "💰 收入" : "💸 支出"}
                  </button>
                  <button
                    onClick={() => handleUpdateTransaction(editingTransaction)}
                    className="flex-[2] bg-app-primary text-app-accent font-bold rounded-2xl py-2.5 px-4 shadow-lg shadow-app-primary/40 active:scale-95 transition-all"
                  >
                    儲存變更
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Account Modal */}
      <AnimatePresence>
        {editingAccount && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingAccount(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <button onClick={() => setEditingAccount(null)} className="p-2 text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">修改銀行帳戶</h3>
                  <p className="text-[10px] text-slate-400">更新您的帳戶資訊</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">銀行名稱</label>
                    <input
                      type="search"
                      value={newBankName}
                      onChange={(e) => setNewBankName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-app-primary/20 transition-all"
                      placeholder="例如: 國泰世華"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">自訂帳戶名稱</label>
                    <input
                      type="search"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-app-primary/20 transition-all"
                      placeholder="例如: 主要薪轉戶"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">帳戶餘額</label>
                    <input
                      type="search"
                      inputMode="decimal"
                      value={newBalance}
                      onChange={(e) => setNewBalance(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-app-primary/20 transition-all"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">標記顏色</label>
                    <div className="flex gap-2">
                      {["#fcd34d", "#fb7185", "#38bdf8", "#34d399", "#818cf8", "#f472b6"].map(color => (
                        <button
                          key={color}
                          onClick={() => setNewAccountColor(color)}
                          className={`w-8 h-8 rounded-full transition-all border-2 ${newAccountColor === color ? "border-slate-800 scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const balance = parseFloat(newBalance);
                    if (newBankName && !isNaN(balance) && editingAccount.id) {
                      handleUpdateAccount(editingAccount.id, newAccountName || newBankName, newBankName, balance, newAccountColor);
                      setEditingAccount(null);
                    }
                  }}
                  disabled={!newBankName || !newBalance}
                  className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  確認修改
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSearchModal && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2rem] p-6 shadow-2xl h-[80vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">明細查詢</h2>
                <button
                  onClick={() => setShowSearchModal(false)}
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Keyword Search */}
              <div className="mb-3">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search size={16} />
                  </span>
                  <input
                    type="search"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    placeholder="搜尋備註關鍵字..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-app-primary/20"
                  />
                  <AnimatePresence>
                    {isSearchFocused && filteredSuggestions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 bg-white/95 backdrop-blur-md border border-slate-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] max-h-52 overflow-y-auto p-2 no-scrollbar"
                      >
                        <div className="text-[10px] font-bold text-slate-400 px-3 py-1.5 uppercase tracking-wider flex items-center justify-between">
                          <span>區間內常用關鍵字</span>
                          <span className="text-[9px] font-normal text-slate-300">由近到遠</span>
                        </div>
                        <div className="h-px bg-slate-100/50 mx-2 mb-1" />
                        <div className="grid grid-cols-1 gap-0.5">
                          {filteredSuggestions.map((note, index) => (
                            <button
                              key={index}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSearchKeyword(note);
                                setIsSearchFocused(false);
                              }}
                              onTouchStart={(e) => {
                                e.preventDefault();
                                setSearchKeyword(note);
                                setIsSearchFocused(false);
                              }}
                              className="group w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:bg-slate-100 rounded-xl transition-all duration-150 flex items-center gap-2 cursor-pointer"
                            >
                              <Clock size={12} className="text-slate-300 group-hover:text-slate-400 transition-colors flex-shrink-0" />
                              <span className="truncate flex-1">{note}</span>
                              <span className="text-[9px] text-slate-300 font-normal opacity-0 group-hover:opacity-100 transition-opacity">
                                帶入搜尋
                              </span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Category Filter Chips */}
              {availableCategories.length > 0 && (
                <div className="mb-4">
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    <button
                      onClick={() => setSearchCategory(null)}
                      className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all duration-200 active:scale-95 ${searchCategory === null
                        ? "bg-app-primary text-app-accent border-app-primary shadow-md shadow-app-primary/20 scale-105"
                        : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100/50"
                        }`}
                    >
                      📁 全部 ({availableCategories.length})
                    </button>
                    {availableCategories.map((cat) => {
                      const isSelected = searchCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setSearchCategory(isSelected ? null : cat.id)}
                          className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-[10px] font-bold border flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${isSelected
                            ? "bg-app-primary text-app-accent border-app-primary shadow-md shadow-app-primary/20 scale-105"
                            : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100/50"
                            }`}
                        >
                          <span className="text-xs leading-none">{cat.emoji}</span>
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Date Pickers - Single Row, No Labels */}
              <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 bg-slate-50 rounded-2xl border border-slate-100">
                <input
                  type="date"
                  value={searchStartDate}
                  onChange={(e) => setSearchStartDate(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-slate-600 outline-none w-full text-center"
                />
                <div className="w-px h-3 bg-slate-200" />
                <input
                  type="date"
                  value={searchEndDate}
                  onChange={(e) => setSearchEndDate(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-slate-600 outline-none w-full text-center"
                />
              </div>

              <div className="flex-1 overflow-y-auto pr-1">
                {(() => {
                  const sD = new Date(searchStartDate);
                  const eD = new Date(searchEndDate);
                  eD.setHours(23, 59, 59, 999);

                  const filtered = transactions.filter(t => {
                    const d = getSafeDate(t.timestamp);
                    const isInRange = d >= sD && d <= eD;

                    if (!isInRange) return false;

                    // Filter by keyword if keyword is entered
                    if (searchKeyword.trim() !== "") {
                      const hasKeyword = t.note && t.note.toLowerCase().includes(searchKeyword.toLowerCase());
                      if (!hasKeyword) return false;
                    }

                    // Filter by category if category is selected
                    if (searchCategory !== null) {
                      if (t.category !== searchCategory) return false;
                    }

                    return true;
                  }).sort((a, b) => {
                    const da = getSafeDate(a.timestamp).getTime();
                    const db = getSafeDate(b.timestamp).getTime();
                    return db - da; // Newest first
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center h-40 text-slate-300">
                        <Search size={40} className="mb-2 opacity-20" />
                        <p className="text-xs font-medium">查無符合條件的紀錄</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-1.5 pb-8">
                      {filtered.map(t => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setEditingTransaction(t);
                            setShowSearchModal(false);
                          }}
                          className="flex items-center justify-between p-2.5 px-3 bg-slate-50 rounded-xl border border-slate-100 active:scale-[0.98] transition-all"
                        >
                          <div className="flex items-center gap-0 overflow-hidden flex-1 mr-2">
                            <span className="text-[11px] font-mono font-bold text-slate-400 flex-shrink-0 w-11">
                              {(() => {
                                const d = getSafeDate(t.timestamp);
                                return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
                              })()}
                            </span>
                            <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                              {getCategoryEmoji(t.category, customCategories)}
                            </div>
                            <div className="flex items-baseline gap-1.5 overflow-hidden ml-2">
                              <span className="text-[13px] font-bold text-slate-700 flex-shrink-0">
                                {getCategoryLabel(t.category, customCategories, t.type)}
                              </span>
                              <span className="text-[11px] text-slate-400 truncate italic">
                                {t.note}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-1">
                            <p className={`text-[13px] font-mono font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-slate-800'}`}>
                              {t.type === 'expense' ? '-' : ''}{t.amount.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Detail Modal */}
      <AnimatePresence>
        {selectedStatsCategory && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStatsCategory(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white rounded-t-[2.5rem] p-6 pb-8 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col z-10"
            >
              {/* Drag handle / Indicator */}
              <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-5" />

              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner"
                    style={{ backgroundColor: `${selectedStatsCategory.type === 'expense' ? '#ef4444' : '#10b981'}15` }}
                  >
                    {selectedStatsCategory.emoji}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{selectedStatsCategory.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {statsTimeframe === 'month' ? `${viewMonth.split('-')[1]}月份` : `${viewMonth.split('-')[0]}年度`}明細
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStatsCategory(null)}
                  className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Summary / Total Card */}
              {(() => {
                const [y, m] = viewMonth.split('-').map(Number);
                const timeframeTransactions = transactions.filter(t => {
                  const tDate = getSafeDate(t.timestamp);
                  return statsTimeframe === "month"
                    ? (tDate.getMonth() + 1 === m && tDate.getFullYear() === y)
                    : tDate.getFullYear() === y;
                });
                const catTx = timeframeTransactions
                  .filter(t => t.category === selectedStatsCategory.id && t.type === selectedStatsCategory.type)
                  .sort((a, b) => getSafeDate(b.timestamp).getTime() - getSafeDate(a.timestamp).getTime());
                const total = catTx.reduce((sum, t) => sum + t.amount, 0);

                return (
                  <>
                    <div className="bg-slate-50 rounded-2xl py-2 px-4 mb-4 flex justify-between items-center border border-slate-100">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">累計金額</span>
                        <p className="text-2xl font-mono font-bold text-slate-800">
                          {total.toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">交易筆數</span>
                        <p className="text-lg font-mono font-bold text-slate-700">{catTx.length} 筆</p>
                      </div>
                    </div>

                    {/* Transactions list */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                      {catTx.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                          <p className="text-xs font-bold">尚無相關紀錄</p>
                        </div>
                      ) : (
                        catTx.map(t => {
                          const dateObj = getSafeDate(t.timestamp);
                          const dateStr = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getDate().toString().padStart(2, '0')}`;
                          return (
                            <div
                              key={t.id}
                              onClick={() => {
                                setEditingTransaction(t);
                                setSelectedStatsCategory(null);
                              }}
                              className="flex items-center justify-between p-3 bg-slate-50/50 hover:bg-slate-50 active:scale-[0.99] rounded-2xl border border-slate-100/50 transition-all cursor-pointer"
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <span className="text-[11px] font-mono font-bold text-slate-400 w-10 flex-shrink-0">
                                  {dateStr}
                                </span>
                                <div className="flex flex-col min-w-0">
                                  {t.accountId && (() => {
                                    const acc = accounts.find(a => a.id === t.accountId);
                                    return (
                                      <span
                                        className="text-[8px] w-max px-1 rounded text-white font-bold mb-0.5"
                                        style={{ backgroundColor: acc?.color || '#94a3b8' }}
                                      >
                                        {acc?.name || "未知"}
                                      </span>
                                    );
                                  })()}
                                  <span className="text-[13px] font-semibold text-slate-700 truncate">
                                    {t.note}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-[13px] font-mono font-bold ${t.type === "income" ? "text-emerald-500" : "text-slate-800"}`}>
                                  {t.type === "income" ? "" : "-"}{t.amount.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Account Modal */}
      <AnimatePresence>
        {showAddAccount && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddAccount(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <button onClick={() => setShowAddAccount(false)} className="p-2 text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">新增銀行帳戶</h3>
                  <p className="text-[10px] text-slate-400">輸入您的帳戶資訊以進行管理</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">銀行名稱 (如: 國泰, 富邦...)</label>
                    <input
                      type="search"
                      value={newBankName}
                      onChange={(e) => setNewBankName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-app-primary/20 transition-all"
                      placeholder="例如: 國泰世華"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">自訂帳戶名稱 (選填)</label>
                    <input
                      type="search"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-app-primary/20 transition-all"
                      placeholder="例如: 主要薪轉戶"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">目前的餘額 (金額)</label>
                    <input
                      type="search"
                      inputMode="decimal"
                      value={newBalance}
                      onChange={(e) => setNewBalance(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-app-primary/20 transition-all"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">標記顏色</label>
                    <div className="flex gap-2">
                      {["#fcd34d", "#fb7185", "#38bdf8", "#34d399", "#818cf8", "#f472b6"].map(color => (
                        <button
                          key={color}
                          onClick={() => setNewAccountColor(color)}
                          className={`w-8 h-8 rounded-full transition-all border-2 ${newAccountColor === color ? "border-slate-800 scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const balance = parseFloat(newBalance);
                    if (newBankName && !isNaN(balance)) {
                      handleAddAccount(newAccountName || newBankName, newBankName, balance, newAccountColor);
                      setShowAddAccount(false);
                    }
                  }}
                  disabled={!newBankName || !newBalance}
                  className="w-full bg-app-primary text-app-accent py-4 rounded-2xl font-bold shadow-lg shadow-app-primary/20 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  確認新增
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl overflow-hidden"
            >
              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-400">
                  <Trash2 size={40} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">確定要刪除此帳戶嗎？</h3>
                  <p className="text-sm text-slate-400 mt-2">刪除後將無法恢復，且相關連動功能可能會受影響。</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="flex-1 bg-slate-100 text-slate-400 font-bold py-4 rounded-2xl active:scale-95 transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={async () => {
                      await handleDeleteAccount(showDeleteConfirm);
                      setShowDeleteConfirm(null);
                    }}
                    className="flex-1 bg-red-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                  >
                    確定刪除
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteCatConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowDeleteCatConfirm(null);
                setCatHasTransactionsNotice(false);
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl overflow-hidden"
            >
              <div className="text-center space-y-6">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${catHasTransactionsNotice ? 'bg-amber-50 text-amber-400' : 'bg-red-50 text-red-400'}`}>
                  {catHasTransactionsNotice ? <AlertCircle size={40} /> : <Trash2 size={40} />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">
                    {catHasTransactionsNotice ? "無法刪除此分類" : "確定要刪除此分類嗎？"}
                  </h3>
                  <p className="text-sm text-slate-400 mt-2">
                    {catHasTransactionsNotice
                      ? "此分類尚有交易紀錄，為了維護帳目正確，請先更改或刪除相關交易後再進行刪除。"
                      : "刪除後將無法恢復，且現有的交易紀錄若使用此分類將顯示為未知。"}
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowDeleteCatConfirm(null);
                      setCatHasTransactionsNotice(false);
                    }}
                    className={`flex-1 font-bold py-4 rounded-2xl active:scale-95 transition-all ${catHasTransactionsNotice ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-slate-100 text-slate-400'}`}
                  >
                    {catHasTransactionsNotice ? "我了解了" : "取消"}
                  </button>
                  {!catHasTransactionsNotice && (
                    <button
                      onClick={async () => {
                        if (showDeleteCatConfirm) {
                          await handleDeleteCustomCategory(showDeleteCatConfirm);
                          setShowDeleteCatConfirm(null);
                          setCatHasTransactionsNotice(false);
                        }
                      }}
                      className="flex-1 bg-red-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                    >
                      確定刪除
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Category Modal */}
      <AnimatePresence>
        {showAddCategory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddCategory(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <button onClick={() => setShowAddCategory(null)} className="p-2 text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-6">
                <div className="w-full space-y-4">
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800">
                      新增{showAddCategory === "expense" ? "支出" : "收入"}分類
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">為新分類命名並選擇一個圖示</p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">圖示 Emoji</label>
                      <input
                        type="search"
                        value={newCatEmoji}
                        onChange={(e) => setNewCatEmoji(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center text-2xl focus:ring-2 focus:ring-app-primary/20 outline-none transition-all"
                        placeholder="請輸入一個 Emoji"
                      />

                      <div className="mt-3 flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-1.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                        {[
                          "🍔", "🍜", "☕", "🍺", "🍦", "🍎",
                          "🚗", "🚌", "🚲", "✈️", "⛽", "🚆",
                          "🏠", "🛍️", "🎁", "💊", "🧼", "🧺",
                          "🎮", "🎬", "🎵", "⚽", "📚", "🏖️",
                          "💰", "💳", "📈", "💻", "🏢", "📧",
                          "✨", "🏮", "🎈", "🐱", "🐶", "🌺"
                        ].map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setNewCatEmoji(emoji)}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl text-xl transition-all ${newCatEmoji === emoji ? "bg-app-primary text-app-accent scale-110 shadow-md shadow-app-primary/20" : "bg-white hover:bg-slate-100 border border-slate-100"}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">分類名稱</label>
                      <input
                        type="search"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 p-3 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-app-primary/20 outline-none transition-all placeholder:text-slate-300"
                        placeholder="例如：餐飲、房租、薪水..."
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (newCatName && newCatEmoji) {
                        handleAddCustomCategory(newCatName, newCatEmoji, showAddCategory);
                        setShowAddCategory(null);
                      }
                    }}
                    disabled={!newCatName || !newCatEmoji}
                    className="w-full bg-app-primary text-app-accent py-3.5 rounded-2xl font-bold shadow-lg shadow-app-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    確認新增
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Category Modal */}
      <AnimatePresence>
        {editingCategory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingCategory(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <button onClick={() => setEditingCategory(null)} className="p-2 text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-6">
                <div className="w-full space-y-4">
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800">
                      修改{editingCategory.type === "expense" ? "支出" : "收入"}分類
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">修改分類名稱與圖示</p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">圖示 Emoji</label>
                      <input
                        type="search"
                        value={newCatEmoji}
                        onChange={(e) => setNewCatEmoji(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center text-2xl focus:ring-2 focus:ring-app-primary/20 outline-none transition-all"
                        placeholder="請輸入一個 Emoji"
                      />

                      <div className="mt-3 flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-1.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                        {[
                          "🍔", "🍜", "☕", "🍺", "🍦", "🍎",
                          "🚗", "🚌", "🚲", "✈️", "⛽", "🚆",
                          "🏠", "🛍️", "🎁", "💊", "🧼", "🧺",
                          "🎮", "🎬", "🎵", "⚽", "📚", "🏖️",
                          "💰", "💳", "📈", "💻", "🏢", "📧",
                          "✨", "🏮", "🎈", "🐱", "🐶", "🌺"
                        ].map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setNewCatEmoji(emoji)}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl text-xl transition-all ${newCatEmoji === emoji ? "bg-app-primary text-app-accent scale-110 shadow-md shadow-app-primary/20" : "bg-white hover:bg-slate-100 border border-slate-100"}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">分類名稱</label>
                      <input
                        type="search"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 p-3 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-app-primary/20 outline-none transition-all placeholder:text-slate-300"
                        placeholder="例如：餐飲、房租、薪水..."
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (newCatName && newCatEmoji && editingCategory.id) {
                        handleUpdateCustomCategory(editingCategory.id, newCatName, newCatEmoji);
                        setEditingCategory(null);
                      }
                    }}
                    disabled={!newCatName || !newCatEmoji}
                    className="w-full bg-app-primary text-app-accent py-3.5 rounded-2xl font-bold shadow-lg shadow-app-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    確認修改
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {showCashTransfer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCashTransfer(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <button onClick={() => setShowCashTransfer(null)} className="p-2 text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-6">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
                  <ArrowRightLeft size={32} />
                </div>

                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-800">
                    {showCashTransfer.type === 'withdraw' ? '提款至現金' : '存款至帳戶'}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1 font-bold">
                    {showCashTransfer.account.name}
                  </p>
                  <div className="mt-3 px-3 py-1.5 bg-amber-50 rounded-xl border border-amber-100/50">
                    <p className="text-[10px] text-amber-600 font-bold leading-tight">
                      ⚠️ 僅調整帳戶與現金餘額，不列入歷史明細紀錄
                    </p>
                  </div>
                </div>

                <div className="w-full space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">輸入金額</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={cashTransferAmount}
                      onChange={(e) => setCashTransferAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center text-2xl font-mono font-bold text-slate-700 focus:ring-2 focus:ring-app-primary/20 outline-none transition-all"
                      placeholder="0"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCashTransfer(null)}
                      className="flex-1 font-bold py-4 rounded-2xl bg-slate-100 text-slate-400 active:scale-95 transition-all text-sm"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleCashTransfer}
                      className="flex-1 bg-app-primary text-app-accent font-bold py-4 rounded-2xl shadow-lg shadow-app-primary/20 active:scale-95 transition-all text-sm"
                    >
                      確認
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Account Detail Modal */}
      <AnimatePresence>
        {showAccountDetail && (() => {
          const acc = showAccountDetail;
          const sD = new Date(accSearchStartDate);
          const eD = new Date(accSearchEndDate);
          eD.setHours(23, 59, 59, 999);

          const accTransactions = transactions
            .filter(t => {
              if (!((t.type === 'income' || t.type === 'expense') && t.accountId === acc.id)) {
                return false;
              }
              const d = getSafeDate(t.timestamp);
              const isInRange = d >= sD && d <= eD;
              if (!isInRange) return false;

              if (accSearchKeyword.trim() !== "") {
                const hasKeyword = t.note && t.note.toLowerCase().includes(accSearchKeyword.toLowerCase());
                if (!hasKeyword) return false;
              }

              if (accSearchCategory !== null) {
                if (t.category !== accSearchCategory) return false;
              }

              return true;
            })
            .sort((a, b) => getSafeDate(b.timestamp).getTime() - getSafeDate(a.timestamp).getTime());

          const accIncome = accTransactions
            .filter(t => t.type === 'income' && t.accountId === acc.id)
            .reduce((s, t) => s + t.amount, 0);
          const accExpense = accTransactions
            .filter(t => t.type === 'expense' && t.accountId === acc.id)
            .reduce((s, t) => s + t.amount, 0);

          // Group accTransactions by month YYYY年MM月
          const groups: { [key: string]: Transaction[] } = {};
          accTransactions.forEach(t => {
            const d = getSafeDate(t.timestamp);
            const monthKey = `${d.getFullYear()}年${(d.getMonth() + 1).toString().padStart(2, '0')}月`;
            if (!groups[monthKey]) groups[monthKey] = [];
            groups[monthKey].push(t);
          });

          return (
            <div className="fixed inset-0 z-[80] flex items-end justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAccountDetail(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 60 }}
                transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                className="relative w-full max-w-md bg-white rounded-t-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: '88dvh' }}
              >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 flex-shrink-0">
                  <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold shadow-inner"
                      style={{ backgroundColor: `${acc.color}20`, color: acc.color, border: `1px solid ${acc.color}40` }}
                    >
                      {acc.bankName.slice(0, 1) || "🏦"}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-800 text-base">{acc.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{acc.bankName}</p>
                    </div>
                    <button
                      onClick={() => setShowAccountDetail(null)}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>


                  {/* Keyword Search */}
                  <div className="mt-3 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Search size={16} />
                    </span>
                    <input
                      type="search"
                      value={accSearchKeyword}
                      onChange={(e) => setAccSearchKeyword(e.target.value)}
                      onFocus={() => setAccIsSearchFocused(true)}
                      onBlur={() => setAccIsSearchFocused(false)}
                      placeholder="搜尋備註關鍵字..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-2.5 pl-11 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-app-primary/20"
                    />
                    <AnimatePresence>
                      {accIsSearchFocused && accFilteredSuggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.96 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 bg-white/95 backdrop-blur-md border border-slate-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] max-h-40 overflow-y-auto p-2 no-scrollbar"
                        >
                          <div className="text-[9px] font-bold text-slate-400 px-3 py-1.5 uppercase tracking-wider flex items-center justify-between">
                            <span>區間內常用關鍵字</span>
                            <span className="text-[8px] font-normal text-slate-300">由近到遠</span>
                          </div>
                          <div className="h-px bg-slate-100/50 mx-2 mb-1" />
                          <div className="grid grid-cols-1 gap-0.5">
                            {accFilteredSuggestions.map((note, index) => (
                              <button
                                key={index}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setAccSearchKeyword(note);
                                  setAccIsSearchFocused(false);
                                }}
                                onTouchStart={(e) => {
                                  e.preventDefault();
                                  setAccSearchKeyword(note);
                                  setAccIsSearchFocused(false);
                                }}
                                className="group w-full text-left px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:bg-slate-100 rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer"
                              >
                                <Clock size={10} className="text-slate-300 group-hover:text-slate-400 transition-colors flex-shrink-0" />
                                <span className="truncate flex-1">{note}</span>
                                <span className="text-[8px] text-slate-300 font-normal opacity-0 group-hover:opacity-100 transition-opacity">
                                  帶入搜尋
                                </span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Category Filter Chips */}
                  {accAvailableCategories.length > 0 && (
                    <div className="mt-2.5">
                      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                        <button
                          onClick={() => setAccSearchCategory(null)}
                          className={`flex-shrink-0 px-3 py-1 rounded-xl text-[9px] font-bold border transition-all duration-200 active:scale-95 ${accSearchCategory === null
                            ? "bg-app-primary text-app-accent border-app-primary shadow-sm"
                            : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100/50"
                            }`}
                        >
                          📁 全部 ({accAvailableCategories.length})
                        </button>
                        {accAvailableCategories.map((cat) => {
                          const isSelected = accSearchCategory === cat.id;
                          return (
                            <button
                              key={cat.id}
                              onClick={() => setAccSearchCategory(isSelected ? null : cat.id)}
                              className={`flex-shrink-0 px-3 py-1 rounded-xl text-[9px] font-bold border flex items-center gap-1 transition-all duration-200 active:scale-95 ${isSelected
                                ? "bg-app-primary text-app-accent border-app-primary shadow-sm"
                                : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100/50"
                                }`}
                            >
                              <span className="text-xs leading-none">{cat.emoji}</span>
                              <span>{cat.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Date Pickers - Single Row, No Labels */}
                  <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <input
                      type="date"
                      value={accSearchStartDate}
                      onChange={(e) => setAccSearchStartDate(e.target.value)}
                      className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full text-center"
                    />
                    <div className="w-px h-3 bg-slate-200" />
                    <input
                      type="date"
                      value={accSearchEndDate}
                      onChange={(e) => setAccSearchEndDate(e.target.value)}
                      className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full text-center"
                    />
                  </div>

                  {/* Summary Row */}
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 rounded-2xl p-3 text-center">
                      <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">收入</p>
                      <p className="font-mono font-bold text-emerald-600 text-sm">{isGlobalHidden ? "****" : accIncome.toLocaleString()}</p>
                    </div>
                    <div className="bg-red-50 rounded-2xl p-3 text-center">
                      <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-1">支出</p>
                      <p className="font-mono font-bold text-red-500 text-sm">{isGlobalHidden ? "****" : accExpense.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Transaction List */}
                <div className="overflow-y-auto flex-1 px-4 pb-6">
                  {accTransactions.length === 0 ? (
                    <div className="py-16 text-center">
                      <p className="text-2xl mb-3">🧾</p>
                      <p className="text-sm font-bold text-slate-300">此帳戶尚無交易紀錄</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(groups).map(([month, items]) => (
                        <div key={month} className="space-y-2">
                          {/* Month Header */}
                          <div className="flex justify-between items-center px-1.5 pt-2">
                            <span className="text-[10px] font-bold text-slate-400">{month}</span>
                            <div className="flex gap-3 text-[10px] font-bold text-slate-300">
                              <span>出: {items.filter(i => i.type === "expense").reduce((a, b) => a + b.amount, 0).toLocaleString()}</span>
                              <span>入: {items.filter(i => i.type === "income").reduce((a, b) => a + b.amount, 0).toLocaleString()}</span>
                            </div>
                          </div>
                          {/* Items using search modal layout */}
                          <div className="space-y-1.5">
                            {items.map(t => (
                              <div
                                key={t.id}
                                onClick={() => {
                                  setEditingTransaction(t);
                                  setShowAccountDetail(null);
                                }}
                                className="flex items-center justify-between p-2.5 px-3 bg-slate-50 rounded-xl border border-slate-100 active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-0 overflow-hidden flex-1 mr-2">
                                  <span className="text-[11px] font-mono font-bold text-slate-400 flex-shrink-0 w-11">
                                    {(() => {
                                      const d = getSafeDate(t.timestamp);
                                      return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
                                    })()}
                                  </span>
                                  <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                                    {getCategoryEmoji(t.category, customCategories)}
                                  </div>
                                  <div className="flex items-baseline gap-1.5 overflow-hidden ml-2">
                                    <span className="text-[13px] font-bold text-slate-700 flex-shrink-0">
                                      {getCategoryLabel(t.category, customCategories, t.type)}
                                    </span>
                                    <span className="text-[11px] text-slate-400 truncate italic">
                                      {t.note}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0 ml-1">
                                  <p className={`text-[13px] font-mono font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-slate-800'}`}>
                                    {t.type === 'expense' ? '-' : ''}{t.amount.toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
