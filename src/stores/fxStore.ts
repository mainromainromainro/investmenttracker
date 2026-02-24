import { create } from 'zustand';
import { FxSnapshot } from '../types';
import { fxRepository } from '../repositories';

interface FxStore {
  fxSnapshots: FxSnapshot[];
  isLoading: boolean;
  
  fetchFxSnapshots: () => Promise<void>;
  addFxSnapshot: (snapshot: Omit<FxSnapshot, 'createdAt'>) => Promise<void>;
  updateFxSnapshot: (id: string, updates: Partial<FxSnapshot>) => Promise<void>;
  deleteFxSnapshot: (id: string) => Promise<void>;
}

export const useFxStore = create<FxStore>((set) => ({
  fxSnapshots: [],
  isLoading: false,

  fetchFxSnapshots: async () => {
    set({ isLoading: true });
    try {
      const fxSnapshots = await fxRepository.getAll();
      set({ fxSnapshots });
    } finally {
      set({ isLoading: false });
    }
  },

  addFxSnapshot: async (snapshot) => {
    const newSnapshot = await fxRepository.create(snapshot);
    set((state) => ({
      fxSnapshots: [...state.fxSnapshots, newSnapshot],
    }));
  },

  updateFxSnapshot: async (id, updates) => {
    await fxRepository.update(id, updates);
    set((state) => ({
      fxSnapshots: state.fxSnapshots.map((fx) =>
        fx.id === id ? { ...fx, ...updates } : fx
      ),
    }));
  },

  deleteFxSnapshot: async (id) => {
    await fxRepository.delete(id);
    set((state) => ({
      fxSnapshots: state.fxSnapshots.filter((fx) => fx.id !== id),
    }));
  },
}));
