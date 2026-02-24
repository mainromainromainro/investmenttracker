import { db } from '../db';
import { Transaction } from '../types';

export const transactionRepository = {
  async getAll() {
    return db.transactions.toArray();
  },

  async getById(id: string) {
    return db.transactions.get(id);
  },

  async getByPlatformId(platformId: string) {
    return db.transactions.where('platformId').equals(platformId).toArray();
  },

  async getByAssetId(assetId: string) {
    return db.transactions.where('assetId').equals(assetId).toArray();
  },

  async create(transaction: Omit<Transaction, 'createdAt'>) {
    const newTransaction: Transaction = {
      ...transaction,
      createdAt: Date.now(),
    };
    await db.transactions.add(newTransaction);
    return newTransaction;
  },

  async update(id: string, updates: Partial<Transaction>) {
    await db.transactions.update(id, updates);
  },

  async delete(id: string) {
    await db.transactions.delete(id);
  },

  async deleteAll() {
    await db.transactions.clear();
  },
};
