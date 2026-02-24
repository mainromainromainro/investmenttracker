import { create } from 'zustand';
import { Transaction } from '../types';
import { transactionRepository } from '../repositories';

interface TransactionStore {
  transactions: Transaction[];
  isLoading: boolean;
  
  fetchTransactions: () => Promise<void>;
  addTransaction: (transaction: Omit<Transaction, 'createdAt'>) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
}

export const useTransactionStore = create<TransactionStore>((set) => ({
  transactions: [],
  isLoading: false,

  fetchTransactions: async () => {
    set({ isLoading: true });
    try {
      const transactions = await transactionRepository.getAll();
      set({ transactions });
    } finally {
      set({ isLoading: false });
    }
  },

  addTransaction: async (transaction) => {
    const newTransaction = await transactionRepository.create(transaction);
    set((state) => ({
      transactions: [...state.transactions, newTransaction],
    }));
  },

  updateTransaction: async (id, updates) => {
    await transactionRepository.update(id, updates);
    set((state) => ({
      transactions: state.transactions.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));
  },

  deleteTransaction: async (id) => {
    await transactionRepository.delete(id);
    set((state) => ({
      transactions: state.transactions.filter((t) => t.id !== id),
    }));
  },
}));
