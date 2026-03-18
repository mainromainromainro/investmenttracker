import { db } from '../db';
import { Account } from '../types';

export const accountRepository = {
  async getAll() {
    return db.accounts.toArray();
  },

  async getById(id: string) {
    return db.accounts.get(id);
  },

  async getByPlatformId(platformId: string) {
    return db.accounts.where('platformId').equals(platformId).toArray();
  },

  async findByPlatformAndName(platformId: string, name: string) {
    return db.accounts.where('[platformId+name]').equals([platformId, name]).first();
  },

  async create(account: Omit<Account, 'createdAt'>) {
    const newAccount: Account = {
      ...account,
      createdAt: Date.now(),
    };
    await db.accounts.add(newAccount);
    return newAccount;
  },

  async update(id: string, updates: Partial<Account>) {
    await db.accounts.update(id, updates);
  },

  async delete(id: string) {
    await db.accounts.delete(id);
  },

  async deleteAll() {
    await db.accounts.clear();
  },
};
