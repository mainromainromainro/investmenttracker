import {
  Asset,
  Transaction,
  PriceSnapshot,
  FxSnapshot,
  Position,
  PortfolioSummary,
  Platform,
  PortfolioHistoryPoint,
  TickerHolding,
} from '../types';

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

const getLatestPriceAtDate = (
  prices: PriceSnapshot[],
  assetId: string,
  date: number
): { price: number; date: number } | null => {
  const candidates = prices.filter((p) => p.assetId === assetId && p.date <= date);
  if (candidates.length === 0) return null;
  const latest = candidates.reduce((max, current) =>
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

const getLatestFxRateAtDate = (
  fxSnapshots: FxSnapshot[],
  currency: string,
  date: number
): number | null => {
  if (currency === 'EUR') return 1;

  const pair = `${currency}/EUR`;
  const snapshots = fxSnapshots.filter((fx) => fx.pair === pair && fx.date <= date);
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
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  
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
    const asset = assetMap.get(assetId);
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
  
  // Aggregate by ticker across all platforms.
  const byTickerMap = new Map<string, TickerHolding>();
  for (const position of positions) {
    const existing = byTickerMap.get(position.assetId);
    if (!existing) {
      byTickerMap.set(position.assetId, {
        assetId: position.assetId,
        asset: position.asset,
        qty: position.qty,
        latestPrice: position.latestPrice,
        latestPriceDate: position.latestPriceDate,
        fxRate: position.fxRate,
        valueEUR: position.valueEUR,
      });
      continue;
    }

    existing.qty += position.qty;
    if (existing.valueEUR === null || position.valueEUR === null) {
      existing.valueEUR = null;
    } else {
      existing.valueEUR += position.valueEUR;
    }
  }

  const byTicker = Array.from(byTickerMap.values())
    .filter((holding) => Math.abs(holding.qty) > 1e-12)
    .sort((a, b) => {
      const valueA = a.valueEUR ?? -Infinity;
      const valueB = b.valueEUR ?? -Infinity;
      if (valueA === valueB) {
        return a.asset.symbol.localeCompare(b.asset.symbol);
      }
      return valueB - valueA;
    });

  // Build portfolio evolution over time from transactional and market dates.
  const datedTransactions = transactions
    .filter((tx) => tx.assetId && (tx.kind === 'BUY' || tx.kind === 'SELL'))
    .sort((a, b) => a.date - b.date);
  const timelineSet = new Set<number>();
  for (const tx of datedTransactions) timelineSet.add(tx.date);
  for (const price of priceSnapshots) timelineSet.add(price.date);
  for (const fx of fxSnapshots) timelineSet.add(fx.date);
  const timelineDates = Array.from(timelineSet).sort((a, b) => a - b);

  const history: PortfolioHistoryPoint[] = [];
  const qtyByAsset = new Map<string, number>();
  let txIndex = 0;

  for (const date of timelineDates) {
    while (txIndex < datedTransactions.length && datedTransactions[txIndex].date <= date) {
      const tx = datedTransactions[txIndex];
      const assetId = tx.assetId!;
      const previousQty = qtyByAsset.get(assetId) ?? 0;
      const delta =
        tx.kind === 'BUY' ? (tx.qty ?? 0) :
        tx.kind === 'SELL' ? -(tx.qty ?? 0) :
        0;
      qtyByAsset.set(assetId, previousQty + delta);
      txIndex++;
    }

    let knownValueEUR = 0;
    let hasMissingData = false;
    let hasOpenPosition = false;

    for (const [assetId, qty] of qtyByAsset) {
      if (Math.abs(qty) <= 1e-12) continue;
      hasOpenPosition = true;

      const asset = assetMap.get(assetId);
      if (!asset) continue;

      const priceAtDate = getLatestPriceAtDate(priceSnapshots, assetId, date);
      const fxRateAtDate = getLatestFxRateAtDate(fxSnapshots, asset.currency, date);
      const valueEUR = computeValueEUR(qty, priceAtDate?.price ?? null, fxRateAtDate);

      if (valueEUR === null) {
        hasMissingData = true;
      } else {
        knownValueEUR += valueEUR;
      }
    }

    if (!hasOpenPosition) continue;
    history.push({
      date,
      totalValueEUR: hasMissingData ? null : knownValueEUR,
      knownValueEUR,
      hasMissingData,
    });
  }

  const totalValueEUR = positions.some((p) => p.valueEUR === null)
    ? null
    : positions.reduce((sum, p) => sum + (p.valueEUR ?? 0), 0);
  
  return {
    positions,
    byTicker,
    history,
    totalValueEUR,
    byPlatform: Array.from(byPlatformMap.values()),
    byType: Array.from(byTypeMap.values()),
  };
};
