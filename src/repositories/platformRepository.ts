import { db } from '../db';
import { Platform } from '../types';

export const platformRepository = {
  async getAll() {
    return db.platforms.toArray();
  },

  async getById(id: string) {
    return db.platforms.get(id);
  },

  async create(platform: Omit<Platform, 'createdAt'>) {
    const newPlatform: Platform = {
      ...platform,
      createdAt: Date.now(),
    };
    await db.platforms.add(newPlatform);
    return newPlatform;
  },

  async update(id: string, updates: Partial<Platform>) {
    await db.platforms.update(id, updates);
  },

  async delete(id: string) {
    await db.platforms.delete(id);
  },

  async deleteAll() {
    await db.platforms.clear();
  },
};
