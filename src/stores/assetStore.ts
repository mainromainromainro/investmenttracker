import { create } from 'zustand';
import { Asset } from '../types';
import { assetRepository } from '../repositories';

interface AssetStore {
  assets: Asset[];
  isLoading: boolean;
  
  fetchAssets: () => Promise<void>;
  addAsset: (asset: Omit<Asset, 'createdAt'>) => Promise<void>;
  updateAsset: (id: string, updates: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
}

export const useAssetStore = create<AssetStore>((set) => ({
  assets: [],
  isLoading: false,

  fetchAssets: async () => {
    set({ isLoading: true });
    try {
      const assets = await assetRepository.getAll();
      set({ assets });
    } finally {
      set({ isLoading: false });
    }
  },

  addAsset: async (asset) => {
    const newAsset = await assetRepository.create(asset);
    set((state) => ({
      assets: [...state.assets, newAsset],
    }));
  },

  updateAsset: async (id, updates) => {
    await assetRepository.update(id, updates);
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    }));
  },

  deleteAsset: async (id) => {
    await assetRepository.delete(id);
    set((state) => ({
      assets: state.assets.filter((a) => a.id !== id),
    }));
  },
}));
