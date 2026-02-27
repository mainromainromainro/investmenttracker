import { describe, it, expect } from 'vitest';
import {
  computePositionQty,
  getLatestPrice,
  getLatestFxRate,
  computeValueEUR,
  computePortfolioSummary,
} from './computations';
import {
  Transaction,
  PriceSnapshot,
  FxSnapshot,
  Asset,
  Platform,
} from '../types';

describe('Investment computations', () => {
  describe('computePositionQty', () => {
    it('should compute qty correctly with BUY and SELL', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          platformId: 'p1',
          assetId: 'a1',
          kind: 'BUY',
          date: 1,
          qty: 10,
          price: 100,
          currency: 'USD',
          createdAt: 1,
        },
        {
          id: '2',
          platformId: 'p1',
          assetId: 'a1',
          kind: 'BUY',
          date: 2,
          qty: 5,
          price: 110,
          currency: 'USD',
          createdAt: 2,
        },
        {
          id: '3',
          platformId: 'p1',
          assetId: 'a1',
          kind: 'SELL',
          date: 3,
          qty: 3,
          price: 120,
          currency: 'USD',
          createdAt: 3,
        },
      ];

      const qty = computePositionQty(transactions, 'a1', 'p1');
      expect(qty).toBe(12); // 10 + 5 - 3
    });

    it('should return 0 if no matching transactions', () => {
      const qty = computePositionQty([], 'a1', 'p1');
      expect(qty).toBe(0);
    });
  });

  describe('getLatestPrice', () => {
    it('should return latest price by date', () => {
      const prices: PriceSnapshot[] = [
        {
          id: '1',
          assetId: 'a1',
          date: 1000,
          price: 100,
          currency: 'USD',
          createdAt: 1,
        },
        {
          id: '2',
          assetId: 'a1',
          date: 2000,
          price: 110,
          currency: 'USD',
          createdAt: 2,
        },
        {
          id: '3',
          assetId: 'a1',
          date: 1500,
          price: 105,
          currency: 'USD',
          createdAt: 3,
        },
      ];

      const result = getLatestPrice(prices, 'a1');
      expect(result).toEqual({ price: 110, date: 2000 });
    });

    it('should return null if no prices found', () => {
      const result = getLatestPrice([], 'a1');
      expect(result).toBeNull();
    });
  });

  describe('getLatestFxRate', () => {
    it('should return 1 for EUR', () => {
      const rate = getLatestFxRate([], 'EUR');
      expect(rate).toBe(1);
    });

    it('should return latest FX rate', () => {
      const fxSnapshots: FxSnapshot[] = [
        {
          id: '1',
          pair: 'USD/EUR',
          date: 1000,
          rate: 0.90,
          createdAt: 1,
        },
        {
          id: '2',
          pair: 'USD/EUR',
          date: 2000,
          rate: 0.92,
          createdAt: 2,
        },
      ];

      const rate = getLatestFxRate(fxSnapshots, 'USD');
      expect(rate).toBe(0.92);
    });

    it('should return null if no rate found', () => {
      const rate = getLatestFxRate([], 'USD');
      expect(rate).toBeNull();
    });
  });

  describe('computeValueEUR', () => {
    it('should compute value correctly', () => {
      const value = computeValueEUR(10, 100, 0.92);
      expect(value).toBe(920);
    });

    it('should return null if price is null', () => {
      const value = computeValueEUR(10, null, 0.92);
      expect(value).toBeNull();
    });

    it('should handle zero quantity', () => {
      const value = computeValueEUR(0, 100, 0.92);
      expect(value).toBe(0);
    });

    it('should return null if FX rate missing', () => {
      const value = computeValueEUR(10, 100, null);
      expect(value).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    it('should reflect seeded sample data snapshot totals', () => {
      // Mirror the /settings seed data to ensure dashboard math remains correct.
      const platforms: Platform[] = [
        { id: 'platform_1', name: 'DEGIRO', createdAt: Date.now() },
        { id: 'platform_2', name: 'Interactive Brokers', createdAt: Date.now() },
      ];
      const assets: Asset[] = [
        {
          id: 'asset_1',
          type: 'ETF',
          symbol: 'VWRL',
          name: 'Vanguard FTSE All-World UCITS ETF',
          currency: 'EUR',
          createdAt: Date.now(),
        },
        {
          id: 'asset_2',
          type: 'STOCK',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          currency: 'USD',
          createdAt: Date.now(),
        },
        {
          id: 'asset_3',
          type: 'CRYPTO',
          symbol: 'BTC',
          name: 'Bitcoin',
          currency: 'USD',
          createdAt: Date.now(),
        },
      ];
      const transactions: Transaction[] = [
        {
          id: 'tx_1',
          platformId: 'platform_1',
          assetId: 'asset_1',
          kind: 'BUY',
          date: new Date('2024-01-01').getTime(),
          qty: 100,
          price: 90.5,
          currency: 'EUR',
          createdAt: Date.now(),
        },
        {
          id: 'tx_2',
          platformId: 'platform_1',
          assetId: 'asset_2',
          kind: 'BUY',
          date: new Date('2024-01-15').getTime(),
          qty: 10,
          price: 150,
          currency: 'USD',
          createdAt: Date.now(),
        },
        {
          id: 'tx_3',
          platformId: 'platform_2',
          assetId: 'asset_3',
          kind: 'BUY',
          date: new Date('2024-02-01').getTime(),
          qty: 0.5,
          price: 45000,
          currency: 'USD',
          createdAt: Date.now(),
        },
      ];
      const prices: PriceSnapshot[] = [
        {
          id: 'price_1',
          assetId: 'asset_1',
          date: Date.now(),
          price: 95.75,
          currency: 'EUR',
          createdAt: Date.now(),
        },
        {
          id: 'price_2',
          assetId: 'asset_2',
          date: Date.now(),
          price: 175.5,
          currency: 'USD',
          createdAt: Date.now(),
        },
        {
          id: 'price_3',
          assetId: 'asset_3',
          date: Date.now(),
          price: 52000,
          currency: 'USD',
          createdAt: Date.now(),
        },
      ];
      const fxSnapshots: FxSnapshot[] = [
        {
          id: 'fx_1',
          pair: 'USD/EUR',
          date: Date.now(),
          rate: 0.92,
          createdAt: Date.now(),
        },
      ];

      const summary = computePortfolioSummary(
        assets,
        transactions,
        prices,
        fxSnapshots,
        platforms
      );

      expect(summary.positions).toHaveLength(3);
      expect(summary.byTicker).toHaveLength(3);
      expect(summary.totalValueEUR).not.toBeNull();
      expect(summary.totalValueEUR).toBeCloseTo(35109.6, 2);
      const platformTotals = Object.fromEntries(
        summary.byPlatform.map((p) => [p.platformId, p.valueEUR])
      );
      expect(platformTotals['platform_1']).toBeCloseTo(11189.6, 2);
      expect(platformTotals['platform_2']).toBeCloseTo(23920, 2);

      const typeTotals = Object.fromEntries(summary.byType.map((t) => [t.type, t.valueEUR]));
      expect(typeTotals.ETF).toBeCloseTo(9575, 2);
      expect(typeTotals.STOCK).toBeCloseTo(1614.6, 2);
      expect(typeTotals.CRYPTO).toBeCloseTo(23920, 2);

      const tickerTotals = Object.fromEntries(
        summary.byTicker.map((holding) => [holding.asset.symbol, holding.qty])
      );
      expect(tickerTotals.VWRL).toBeCloseTo(100, 4);
      expect(tickerTotals.AAPL).toBeCloseTo(10, 4);
      expect(tickerTotals.BTC).toBeCloseTo(0.5, 4);
      expect(summary.history.length).toBeGreaterThan(0);
    });

    it('should compute EUR value for a manual single-asset entry', () => {
      const timestamp = Date.now();
      const platforms: Platform[] = [{ id: 'p1', name: 'My Broker', createdAt: timestamp }];
      const assets: Asset[] = [
        {
          id: 'a1',
          type: 'STOCK',
          symbol: 'MSFT',
          name: 'Microsoft',
          currency: 'USD',
          createdAt: timestamp,
        },
      ];
      const transactions: Transaction[] = [
        {
          id: 't1',
          platformId: 'p1',
          assetId: 'a1',
          kind: 'BUY',
          date: timestamp,
          qty: 2,
          price: 50,
          currency: 'USD',
          createdAt: timestamp,
        },
      ];
      const prices: PriceSnapshot[] = [
        { id: 'ps1', assetId: 'a1', date: timestamp, price: 55, currency: 'USD', createdAt: timestamp },
      ];
      const fxSnapshots: FxSnapshot[] = [
        { id: 'fx1', pair: 'USD/EUR', date: timestamp, rate: 0.9, createdAt: timestamp },
      ];

      const summary = computePortfolioSummary(
        assets,
        transactions,
        prices,
        fxSnapshots,
        platforms
      );

      expect(summary.positions).toHaveLength(1);
      expect(summary.byTicker).toHaveLength(1);
      expect(summary.byTicker[0]?.qty).toBeCloseTo(2, 4);
      const position = summary.positions[0];
      expect(position.valueEUR).toBeCloseTo(99, 2); // 2 * 55 * 0.9
      expect(summary.totalValueEUR).toBeCloseTo(99, 2);
    });

    it('should consolidate buy and sell movements to a single net ticker quantity', () => {
      const timestamp = Date.now();
      const platforms: Platform[] = [{ id: 'p1', name: 'Broker', createdAt: timestamp }];
      const assets: Asset[] = [
        {
          id: 'a1',
          type: 'STOCK',
          symbol: 'TSLA',
          name: 'Tesla',
          currency: 'USD',
          createdAt: timestamp,
        },
      ];
      const transactions: Transaction[] = [
        {
          id: 't1',
          platformId: 'p1',
          assetId: 'a1',
          kind: 'BUY',
          date: timestamp - 2000,
          qty: 10,
          price: 150,
          currency: 'USD',
          createdAt: timestamp,
        },
        {
          id: 't2',
          platformId: 'p1',
          assetId: 'a1',
          kind: 'SELL',
          date: timestamp - 1000,
          qty: 4,
          price: 200,
          currency: 'USD',
          createdAt: timestamp,
        },
      ];
      const prices: PriceSnapshot[] = [
        {
          id: 'ps1',
          assetId: 'a1',
          date: timestamp,
          price: 210,
          currency: 'USD',
          createdAt: timestamp,
        },
      ];
      const fxSnapshots: FxSnapshot[] = [
        {
          id: 'fx1',
          pair: 'USD/EUR',
          date: timestamp,
          rate: 0.9,
          createdAt: timestamp,
        },
      ];

      const summary = computePortfolioSummary(
        assets,
        transactions,
        prices,
        fxSnapshots,
        platforms
      );

      expect(summary.byTicker).toHaveLength(1);
      expect(summary.byTicker[0]?.qty).toBeCloseTo(6, 4);
      expect(summary.byTicker[0]?.valueEUR).toBeCloseTo(1134, 2); // 6 * 210 * 0.9
    });
  });
});
