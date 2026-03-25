import { db } from '../db';
import { ImportRow, ImportSourceProfile } from '../types';

export const importRowRepository = {
  async getAll() {
    return db.importRows.toArray();
  },

  async getByImportJobId(importJobId: string) {
    return db.importRows.where('importJobId').equals(importJobId).sortBy('rowNumber');
  },

  async getBySourceProfile(sourceProfile: ImportSourceProfile) {
    return db.importRows.where('sourceProfile').equals(sourceProfile).sortBy('rowNumber');
  },

  async getBySourceTemplateId(sourceTemplateId: string) {
    return db.importRows.where('sourceTemplateId').equals(sourceTemplateId).sortBy('rowNumber');
  },

  async create(importRow: Omit<ImportRow, 'createdAt'>) {
    const newImportRow: ImportRow = {
      ...importRow,
      createdAt: Date.now(),
    };
    await db.importRows.add(newImportRow);
    return newImportRow;
  },

  async bulkCreate(rows: Array<Omit<ImportRow, 'createdAt'>>) {
    const timestamp = Date.now();
    const payload = rows.map((row, index) => ({
      ...row,
      createdAt: timestamp + index,
    }));
    if (payload.length) {
      await db.importRows.bulkPut(payload);
    }
    return payload;
  },

  async deleteByImportJobId(importJobId: string) {
    const rows = await db.importRows.where('importJobId').equals(importJobId).primaryKeys();
    if (rows.length) {
      await db.importRows.bulkDelete(rows);
    }
  },

  async deleteAll() {
    await db.importRows.clear();
  },
};
