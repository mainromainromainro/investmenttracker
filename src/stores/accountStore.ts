import { create } from 'zustand';
import { Account } from '../types';
import { accountRepository } from '../repositories';

interface AccountStore {
  accounts: Account[];
  isLoading: boolean;

  fetchAccounts: () => Promise<void>;
  addAccount: (account: Omit<Account, 'createdAt'>) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
}

export const useAccountStore = create<AccountStore>((set) => ({
  accounts: [],
  isLoading: false,

  fetchAccounts: async () => {
    set({ isLoading: true });
    try {
      const accounts = await accountRepository.getAll();
      set({ accounts });
    } finally {
      set({ isLoading: false });
    }
  },

  addAccount: async (account) => {
    const newAccount = await accountRepository.create(account);
    set((state) => ({
      accounts: [...state.accounts, newAccount],
    }));
  },

  updateAccount: async (id, updates) => {
    await accountRepository.update(id, updates);
    set((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === id ? { ...account, ...updates } : account,
      ),
    }));
  },

  deleteAccount: async (id) => {
    await accountRepository.delete(id);
    set((state) => ({
      accounts: state.accounts.filter((account) => account.id !== id),
    }));
  },
}));
