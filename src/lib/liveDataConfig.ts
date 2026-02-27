const LIVE_DATA_KEY_STORAGE = 'investment-tracker.live-data-api-key';
const FALLBACK_API_KEY = 'demo';

export const getLiveDataApiKey = (): string => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(LIVE_DATA_KEY_STORAGE)?.trim();
    if (stored) {
      return stored;
    }
  }
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const envValue = viteEnv?.VITE_TWELVE_DATA_API_KEY;
  if (typeof envValue === 'string' && envValue.trim()) {
    return envValue.trim();
  }
  return FALLBACK_API_KEY;
};

export const saveLiveDataApiKey = (value: string): void => {
  if (typeof window === 'undefined') return;
  const trimmed = value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(LIVE_DATA_KEY_STORAGE);
    return;
  }
  window.localStorage.setItem(LIVE_DATA_KEY_STORAGE, trimmed);
};

export const hasCustomLiveDataApiKey = (): boolean => {
  const key = getLiveDataApiKey();
  return key !== FALLBACK_API_KEY;
};
