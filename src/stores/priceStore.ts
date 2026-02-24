import { create } from 'zustand';
import { PriceSnapshot } from '../types';
import { priceRepository } from '../repositories';

interface PriceStore {
  prices: PriceSnapshot[];
  isLoading: boolean;
  
  fetchPrices: () => Promise<void>;
  addPrice: (price: Omit<PriceSnapshot, 'createdAt'>) => Promise<void>;
  updatePrice: (id: string, updates: Partial<PriceSnapshot>) => Promise<void>;
  deletePrice: (id: string) => Promise<void>;
}

export const usePriceStore = create<PriceStore>((set) => ({
  prices: [],
  isLoading: false,

  fetchPrices: async () => {
    set({ isLoading: true });
    try {
      const prices = await priceRepository.getAll();
      set({ prices });
    } finally {
      set({ isLoading: false });
    }
  },

  addPrice: async (price) => {
    const newPrice = await priceRepository.create(price);
    set((state) => ({
      prices: [...state.prices, newPrice],
    }));
  },

  updatePrice: async (id, updates) => {
    await priceRepository.update(id, updates);
    set((state) => ({
      prices: state.prices.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  },

  deletePrice: async (id) => {
    await priceRepository.delete(id);
    set((state) => ({
      prices: state.prices.filter((p) => p.id !== id),
    }));
  },
}));
