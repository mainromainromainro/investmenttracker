import { db } from '../db';
import { ImportJob, ImportSourceProfile } from '../types';

export const importJobRepository = {
  async getAll() {
    const jobs = await db.importJobs.toArray();
    return jobs.sort((a, b) => b.importedAt - a.importedAt);
  },

  async getById(id: string) {
    return db.importJobs.get(id);
  },

  async getByFingerprint(fileFingerprint: string) {
    return db.importJobs.where('fileFingerprint').equals(fileFingerprint).sortBy('importedAt');
  },

  async getBySourceProfile(sourceProfile: ImportSourceProfile) {
    return db.importJobs.where('sourceProfile').equals(sourceProfile).sortBy('importedAt');
  },

  async getBySourceTemplateId(sourceTemplateId: string) {
    return db.importJobs.where('sourceTemplateId').equals(sourceTemplateId).sortBy('importedAt');
  },

  async getLatestBySourceProfile(sourceProfile: ImportSourceProfile) {
    const jobs = await this.getBySourceProfile(sourceProfile);
    return jobs.length > 0 ? jobs[jobs.length - 1] : undefined;
  },

  async getLatestByFingerprint(fileFingerprint: string) {
    const jobs = await this.getByFingerprint(fileFingerprint);
    return jobs.length > 0 ? jobs[jobs.length - 1] : undefined;
  },

  async create(importJob: Omit<ImportJob, 'createdAt'>) {
    const newImportJob: ImportJob = {
      ...importJob,
      createdAt: Date.now(),
    };
    await db.importJobs.add(newImportJob);
    return newImportJob;
  },

  async update(id: string, updates: Partial<ImportJob>) {
    await db.importJobs.update(id, updates);
  },

  async delete(id: string) {
    await db.importJobs.delete(id);
  },

  async deleteAll() {
    await db.importJobs.clear();
  },
};
