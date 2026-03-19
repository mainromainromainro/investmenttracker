import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFxRatesToEur } from './liveMarketData';

describe('fetchFxRatesToEur', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches FX rates from Twelve Data exchange_rate', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('USD%2FEUR')) {
        return {
          ok: true,
          json: async () => ({ symbol: 'USD/EUR', rate: '0.92' }),
        };
      }
      if (url.includes('GBP%2FEUR')) {
        return {
          ok: true,
          json: async () => ({ symbol: 'GBP/EUR', rate: 1.17 }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchFxRatesToEur(['EUR', 'USD', 'GBP', 'USD']);

    expect(result.rates).toEqual({
      GBP: 1.17,
      USD: 0.92,
    });
    expect(result.errors).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns errors when the provider does not return a valid rate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: 'error', message: 'Invalid symbol' }),
      })),
    );

    const result = await fetchFxRatesToEur(['CHF']);

    expect(result.rates).toEqual({});
    expect(result.errors).toEqual([
      {
        currency: 'CHF',
        message: 'Invalid symbol',
      },
    ]);
  });
});

