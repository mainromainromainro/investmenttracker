import { describe, expect, it } from 'vitest';
import { analyzePortfolio, AnalyticsTransaction } from './portfolioAnalytics';
import { Asset, FxSnapshot, Platform, PriceSnapshot } from '../types';

const makeTimestamp = (offset: number) => Date.UTC(2025, 0, 1) + offset;

const assets: Asset[] = [
  {
    id: 'asset_usd',
    type: 'STOCK',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    currency: 'USD',
    createdAt: makeTimestamp(0),
  },
  {
    id: 'asset_crypto',
    type: 'CRYPTO',
    symbol: 'BTC',
    name: 'Bitcoin',
    currency: 'USD',
    createdAt: makeTimestamp(0),
  },
  {
    id: 'asset_eur',
    type: 'ETF',
    symbol: 'VWCE',
    name: 'Vanguard FTSE All-World',
    currency: 'EUR',
    createdAt: makeTimestamp(0),
  },
];

const platforms: Platform[] = [
  { id: 'p1', name: 'Broker One', createdAt: makeTimestamp(0) },
  { id: 'p2', name: 'Crypto Exchange', createdAt: makeTimestamp(0) },
];

const fxSnapshots: FxSnapshot[] = [
  { id: 'fx_usd', pair: 'USD/EUR', date: makeTimestamp(0), rate: 0.9, createdAt: makeTimestamp(0) },
];

const priceSnapshots: PriceSnapshot[] = [
  { id: 'aapl_price', assetId: 'asset_usd', date: makeTimestamp(10), price: 180, currency: 'USD', createdAt: makeTimestamp(10) },
  { id: 'btc_price', assetId: 'asset_crypto', date: makeTimestamp(10), price: 50000, currency: 'USD', createdAt: makeTimestamp(10) },
  { id: 'vwce_price', assetId: 'asset_eur', date: makeTimestamp(10), price: 110, currency: 'EUR', createdAt: makeTimestamp(10) },
];

describe('portfolioAnalytics', () => {
  it('computes cost basis, unrealized PnL and winners/losers from trades', () => {
    const transactions: AnalyticsTransaction[] = [
      {
        id: 'buy_aapl',
        platformId: 'p1',
        assetId: 'asset_usd',
        kind: 'BUY',
        date: makeTimestamp(1),
        qty: 10,
        price: 100,
        currency: 'USD',
        createdAt: makeTimestamp(1),
      },
      {
        id: 'buy_btc',
        platformId: 'p2',
        assetId: 'asset_crypto',
        kind: 'BUY',
        date: makeTimestamp(2),
        qty: 1,
        price: 30000,
        currency: 'USD',
        createdAt: makeTimestamp(2),
      },
      {
        id: 'sell_btc',
        platformId: 'p2',
        assetId: 'asset_crypto',
        kind: 'SELL',
        date: makeTimestamp(3),
        qty: 0.25,
        price: 40000,
        currency: 'USD',
        createdAt: makeTimestamp(3),
      },
    ];

    const summary = analyzePortfolio({
      assets,
      platforms,
      transactions,
      priceSnapshots,
      fxSnapshots,
    });

    expect(summary.positions).toHaveLength(2);
    expect(summary.holdings).toHaveLength(2);

    const aapl = summary.positions.find((position) => position.assetId === 'asset_usd');
    const btc = summary.positions.find((position) => position.assetId === 'asset_crypto');
    expect(aapl?.costBasisEUR).toBeCloseTo(900, 2);
    expect(aapl?.marketValueEUR).toBeCloseTo(1620, 2);
    expect(aapl?.unrealizedPnlEUR).toBeCloseTo(720, 2);
    expect(aapl?.unrealizedPnlPct).toBeCloseTo(0.8, 6);

    expect(btc?.quantity).toBeCloseTo(0.75, 4);
    expect(btc?.costBasisEUR).toBeCloseTo(20250, 2);
    expect(btc?.marketValueEUR).toBeCloseTo(33750, 2);
    expect(btc?.unrealizedPnlEUR).toBeCloseTo(13500, 2);

    expect(summary.totals.marketValueEUR).toBeCloseTo(35370, 2);
    expect(summary.totals.costBasisEUR).toBeCloseTo(21150, 2);
    expect(summary.totals.unrealizedPnlEUR).toBeCloseTo(14220, 2);
    expect(summary.winners[0]?.assetId).toBe('asset_usd');
    expect(summary.losers).toHaveLength(0);
  });

  it('tracks dividends, rewards and fees without folding them into market value', () => {
    const transactions: AnalyticsTransaction[] = [
      {
        id: 'buy_vwce',
        platformId: 'p1',
        assetId: 'asset_eur',
        kind: 'BUY',
        date: makeTimestamp(1),
        qty: 20,
        price: 100,
        currency: 'EUR',
        fee: 2,
        createdAt: makeTimestamp(1),
      },
      {
        id: 'dividend_vwce',
        platformId: 'p1',
        assetId: 'asset_eur',
        kind: 'DIVIDEND',
        date: makeTimestamp(2),
        price: 15,
        currency: 'EUR',
        createdAt: makeTimestamp(2),
      },
      {
        id: 'reward_btc',
        platformId: 'p2',
        assetId: 'asset_crypto',
        kind: 'STAKING_REWARD',
        date: makeTimestamp(2),
        qty: 0.01,
        price: 50000,
        currency: 'USD',
        createdAt: makeTimestamp(2),
      },
      {
        id: 'platform_fee',
        platformId: 'p1',
        kind: 'FEE',
        date: makeTimestamp(2),
        fee: 5,
        currency: 'EUR',
        createdAt: makeTimestamp(2),
      },
    ];

    const summary = analyzePortfolio({
      assets,
      platforms,
      transactions,
      priceSnapshots,
      fxSnapshots,
    });

    const vwce = summary.positions.find((position) => position.assetId === 'asset_eur');
    const btc = summary.positions.find((position) => position.assetId === 'asset_crypto');

    expect(vwce?.dividendsEUR).toBeCloseTo(15, 2);
    expect(vwce?.feesEUR).toBeCloseTo(2, 2);
    expect(vwce?.costBasisEUR).toBeCloseTo(2002, 2);
    expect(vwce?.marketValueEUR).toBeCloseTo(2200, 2);

    expect(btc?.rewardsEUR).toBeCloseTo(450, 2);
    expect(btc?.costBasisEUR).toBeCloseTo(450, 2);
    expect(summary.totals.dividendsEUR).toBeCloseTo(15, 2);
    expect(summary.totals.rewardsEUR).toBeCloseTo(450, 2);
    expect(summary.totals.feesEUR).toBeCloseTo(7, 2);
  });

  it('preserves transfer basis across accounts when the move is matched', () => {
    const transactions: AnalyticsTransaction[] = [
      {
        id: 'buy_vwce',
        platformId: 'p1',
        assetId: 'asset_eur',
        kind: 'BUY',
        date: makeTimestamp(1),
        qty: 10,
        price: 100,
        currency: 'EUR',
        createdAt: makeTimestamp(1),
      },
      {
        id: 'transfer_out',
        platformId: 'p1',
        assetId: 'asset_eur',
        kind: 'TRANSFER_OUT',
        date: makeTimestamp(2),
        qty: 10,
        currency: 'EUR',
        createdAt: makeTimestamp(2),
      },
      {
        id: 'transfer_in',
        platformId: 'p2',
        assetId: 'asset_eur',
        kind: 'TRANSFER_IN',
        date: makeTimestamp(3),
        qty: 10,
        currency: 'EUR',
        createdAt: makeTimestamp(3),
      },
    ];

    const summary = analyzePortfolio({
      assets,
      platforms,
      transactions,
      priceSnapshots,
      fxSnapshots,
    });

    const source = summary.positions.find((position) => position.platformId === 'p1');
    const destination = summary.positions.find((position) => position.platformId === 'p2');

    expect(source).toBeUndefined();
    expect(destination?.costBasisEUR).toBeCloseTo(1000, 2);
    expect(destination?.quantity).toBeCloseTo(10, 4);
    expect(summary.dataQuality.unmatchedTransferCount).toBe(0);
  });

  it('reports missing price, missing fx and missing cost basis clearly', () => {
    const transactions: AnalyticsTransaction[] = [
      {
        id: 'buy_unknown',
        platformId: 'p1',
        assetId: 'asset_usd',
        kind: 'BUY',
        date: makeTimestamp(1),
        qty: 5,
        price: 100,
        currency: 'USD',
        createdAt: makeTimestamp(1),
      },
      {
        id: 'buy_missing_price',
        platformId: 'p1',
        assetId: 'asset_eur',
        kind: 'BUY',
        date: makeTimestamp(1),
        qty: 1,
        price: 100,
        currency: 'EUR',
        createdAt: makeTimestamp(1),
      },
      {
        id: 'legacy_snapshot',
        platformId: 'p1',
        assetId: 'asset_eur',
        kind: 'BUY',
        date: makeTimestamp(1),
        qty: 3,
        price: 50,
        currency: 'EUR',
        source: 'POSITION_SNAPSHOT',
        createdAt: makeTimestamp(1),
      },
      {
        id: 'legacy_tx',
        platformId: 'p1',
        assetId: 'asset_eur',
        kind: 'BUY',
        date: makeTimestamp(1),
        qty: 999,
        price: 1,
        currency: 'EUR',
        source: 'CSV_TRANSACTION',
        createdAt: makeTimestamp(0),
      },
      {
        id: 'transfer_in_unknown',
        platformId: 'p2',
        assetId: 'asset_crypto',
        kind: 'TRANSFER_IN',
        date: makeTimestamp(2),
        qty: 1,
        currency: 'USD',
        createdAt: makeTimestamp(2),
      },
    ];

    const summary = analyzePortfolio({
      assets,
      platforms,
      transactions,
      priceSnapshots: [],
      fxSnapshots: [],
    });

    expect(summary.positions).toHaveLength(3);
    expect(summary.dataQuality.missingPricePositions).toBeGreaterThanOrEqual(2);
    expect(summary.dataQuality.missingFxPositions).toBeGreaterThanOrEqual(2);
    expect(summary.dataQuality.missingCostBasisPositions).toBeGreaterThanOrEqual(1);
    expect(summary.dataQuality.unmatchedTransferCount).toBe(1);
  });
});
