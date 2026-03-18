import { create } from 'zustand';
import { ImportJob } from '../types';
import { importJobRepository } from '../repositories';

interface ImportJobStore {
  importJobs: ImportJob[];
  isLoading: boolean;

  fetchImportJobs: () => Promise<void>;
}

export const useImportJobStore = create<ImportJobStore>((set) => ({
  importJobs: [],
  isLoading: false,

  fetchImportJobs: async () => {
    set({ isLoading: true });
    try {
      const importJobs = await importJobRepository.getAll();
      set({ importJobs });
    } finally {
      set({ isLoading: false });
    }
  },
}));
