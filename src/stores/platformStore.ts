import { create } from 'zustand';
import { Platform } from '../types';
import { platformRepository } from '../repositories';

interface PlatformStore {
  platforms: Platform[];
  isLoading: boolean;
  
  fetchPlatforms: () => Promise<void>;
  addPlatform: (platform: Omit<Platform, 'createdAt'>) => Promise<void>;
  updatePlatform: (id: string, updates: Partial<Platform>) => Promise<void>;
  deletePlatform: (id: string) => Promise<void>;
}

export const usePlatformStore = create<PlatformStore>((set) => ({
  platforms: [],
  isLoading: false,

  fetchPlatforms: async () => {
    set({ isLoading: true });
    try {
      const platforms = await platformRepository.getAll();
      set({ platforms });
    } finally {
      set({ isLoading: false });
    }
  },

  addPlatform: async (platform) => {
    const newPlatform = await platformRepository.create(platform);
    set((state) => ({
      platforms: [...state.platforms, newPlatform],
    }));
  },

  updatePlatform: async (id, updates) => {
    await platformRepository.update(id, updates);
    set((state) => ({
      platforms: state.platforms.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  },

  deletePlatform: async (id) => {
    await platformRepository.delete(id);
    set((state) => ({
      platforms: state.platforms.filter((p) => p.id !== id),
    }));
  },
}));
