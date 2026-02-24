import { Asset, Transaction, PriceSnapshot, FxSnapshot, Position, PortfolioSummary, Platform } from '../types';

/**
 * Compute position quantity for an asset on a platform
 * qty = sum(BUY.qty) - sum(SELL.qty)
 */
export const computePositionQty = (
  transactions: Transaction[],
  assetId: string,
  platformId: string
): number => {
  return transactions
    .filter(
      (t) =>
        t.assetId === assetId &&
        t.platformId === platformId
    )
    .reduce((sum, t) => {
      if (t.kind === 'BUY') return sum + (t.qty || 0);
      if (t.kind === 'SELL') return sum - (t.qty || 0);
      return sum;
    }, 0);
};

/**
 * Get latest price for an asset
 */
export const getLatestPrice = (
  prices: PriceSnapshot[],
  assetId: string
): { price: number; date: number } | null => {
  const assetPrices = prices.filter((p) => p.assetId === assetId);
  if (assetPrices.length === 0) return null;
  
  const latest = assetPrices.reduce((max, current) =>
    current.date > max.date ? current : max
  );
  
  return { price: latest.price, date: latest.date };
};

/**
 * Get latest FX rate for a currency to EUR
 * If currency is EUR, returns 1
 */
export const getLatestFxRate = (
  fxSnapshots: FxSnapshot[],
  currency: string
): number | null => {
  if (currency === 'EUR') return 1;
  
  const pair = `${currency}/EUR`;
  const snapshots = fxSnapshots.filter((fx) => fx.pair === pair);
  if (snapshots.length === 0) return null;
  
  const latest = snapshots.reduce((max, current) =>
    current.date > max.date ? current : max
  );
  
  return latest.rate;
};

/**
 * Compute value in EUR for a position
 */
export const computeValueEUR = (
  qty: number,
  price: number | null,
  fxRate: number | null
): number | null => {
  if (price === null || fxRate === null) return null;
  return qty * price * fxRate;
};

/**
 * Compute all positions and portfolio summary
 */
export const computePortfolioSummary = (
  assets: Asset[],
  transactions: Transaction[],
  priceSnapshots: PriceSnapshot[],
  fxSnapshots: FxSnapshot[],
  platforms: Platform[]
): PortfolioSummary => {
  const positions: Position[] = [];
  
  // Group transactions by asset+platform
  const assetPlatformMap = new Map<string, { assetId: string; platformId: string }>();
  
  for (const tx of transactions) {
    if (!tx.assetId) continue;
    const key = `${tx.assetId}:${tx.platformId}`;
    if (!assetPlatformMap.has(key)) {
      assetPlatformMap.set(key, { assetId: tx.assetId, platformId: tx.platformId });
    }
  }
  
  // Compute position for each asset+platform combination
  for (const [, { assetId, platformId }] of assetPlatformMap) {
    const asset = assets.find((a) => a.id === assetId);
    const platform = platforms.find((p) => p.id === platformId);
    
    if (!asset || !platform) continue;
    
    const qty = computePositionQty(transactions, assetId, platformId);
    const latestPriceData = getLatestPrice(priceSnapshots, assetId);
    const fxRate = getLatestFxRate(fxSnapshots, asset.currency);
    
    const valueEUR = computeValueEUR(
      qty,
      latestPriceData?.price ?? null,
      fxRate
    );
    
    positions.push({
      assetId,
      platformId,
      asset,
      platform,
      qty,
      latestPrice: latestPriceData?.price ?? null,
      latestPriceDate: latestPriceData?.date ?? null,
      currency: asset.currency,
      fxRate,
      valueEUR,
    });
  }
  
  // Aggregate by platform
  const byPlatformMap = new Map<string, { platformId: string; name: string; valueEUR: number | null }>();
  
  for (const position of positions) {
    const key = position.platformId;
    if (!byPlatformMap.has(key)) {
      byPlatformMap.set(key, {
        platformId: position.platformId,
        name: position.platform.name,
        valueEUR: 0,
      });
    }
    const entry = byPlatformMap.get(key)!;
    if (position.valueEUR === null) {
      entry.valueEUR = null;
      continue;
    }
    if (entry.valueEUR === null) continue;
    entry.valueEUR += position.valueEUR;
  }
  
  // Aggregate by type
  const byTypeMap = new Map<string, { type: Asset['type']; valueEUR: number | null }>();
  
  for (const position of positions) {
    const key = position.asset.type;
    if (!byTypeMap.has(key)) {
      byTypeMap.set(key, { type: key, valueEUR: 0 });
    }
    const entry = byTypeMap.get(key)!;
    if (position.valueEUR === null) {
      entry.valueEUR = null;
      continue;
    }
    if (entry.valueEUR === null) continue;
    entry.valueEUR += position.valueEUR;
  }
  
  const totalValueEUR = positions.some((p) => p.valueEUR === null)
    ? null
    : positions.reduce((sum, p) => sum + (p.valueEUR ?? 0), 0);
  
  return {
    totalValueEUR,
    byPlatform: Array.from(byPlatformMap.values()),
    byType: Array.from(byTypeMap.values()),
    positions,
  };
};
