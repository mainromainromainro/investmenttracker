import React, { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';
import { computePortfolioSummary } from '../../lib/computations';
import { PortfolioHistoryPoint, PortfolioSummary, Position, Transaction } from '../../types';
import { fetchFxRatesToEur, fetchLiveQuotes } from '../../lib/liveMarketData';

type DashboardSeverity = 'info' | 'warn' | 'critical';

interface DashboardIssue {
  id: string;
  severity: DashboardSeverity;
  title: string;
  detail: string;
}

interface BucketInsight {
  id: string;
  label: string;
  count: number;
  valueEUR: number | null;
  costBasisEUR: number | null;
  unrealizedGainEUR: number | null;
  unrealizedGainPct: number | null;
}

interface HoldingInsight extends Position {
  costBasisEUR: number | null;
  unrealizedGainEUR: number | null;
  unrealizedGainPct: number | null;
  missingDataReason: string | null;
  hasSnapshotOrigin: boolean;
}

interface DashboardMetrics {
  totalValueEUR: number | null;
  totalCostBasisEUR: number | null;
  unrealizedGainEUR: number | null;
  unrealizedGainPct: number | null;
  positionCount: number;
  valuedPositionCount: number;
  missingPriceCount: number;
  missingFxCount: number;
  missingCostBasisCount: number;
}

interface DashboardSnapshot {
  metrics: DashboardMetrics;
  holdings: HoldingInsight[];
  byTicker: BucketInsight[];
  byPlatform: BucketInsight[];
  byType: BucketInsight[];
  winners: HoldingInsight[];
  losers: HoldingInsight[];
  issues: DashboardIssue[];
  allocationScope: 'Platform' | 'Account';
}

interface DashboardAnalyticsProvider {
  computeSnapshot?: (input: DashboardAnalyticsInput) => DashboardSnapshot | Promise<DashboardSnapshot>;
}

interface DashboardAnalyticsInput {
  summary: PortfolioSummary;
  transactions: Transaction[];
  assets: ReturnType<typeof useAssetStore.getState>['assets'];
  platforms: ReturnType<typeof usePlatformStore.getState>['platforms'];
  prices: ReturnType<typeof usePriceStore.getState>['prices'];
  fxSnapshots: ReturnType<typeof useFxStore.getState>['fxSnapshots'];
}

declare global {
  interface Window {
    __investmentTrackerAnalytics?: DashboardAnalyticsProvider;
    __portfolioAnalytics?: DashboardAnalyticsProvider;
  }
}

const formatCurrency = (value: number, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatSignedCurrency = (value: number, currency = 'EUR') => {
  const absolute = formatCurrency(Math.abs(value), currency);
  return `${value >= 0 ? '+' : '-'}${absolute}`;
};

const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatSignedNumber = (value: number, digits = 2) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

const formatCompactQty = (value: number) => {
  if (Math.abs(value) >= 1000) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(1);
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(4);
  }
  return value.toFixed(6);
};

const getFxRateAtDate = (
  fxSnapshots: DashboardAnalyticsInput['fxSnapshots'],
  currency: string,
  date: number,
): number | null => {
  if (currency === 'EUR') {
    return 1;
  }

  const pair = `${currency}/EUR`;
  const candidates = fxSnapshots.filter((snapshot) => snapshot.pair === pair && snapshot.date <= date);
  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((latest, current) => (current.date > latest.date ? current : latest)).rate;
};

const convertToEur = (
  amount: number,
  currency: string,
  date: number,
  fxSnapshots: DashboardAnalyticsInput['fxSnapshots'],
): number | null => {
  const fxRate = getFxRateAtDate(fxSnapshots, currency, date);
  if (fxRate === null) {
    return null;
  }
  return amount * fxRate;
};

const getDashboardAnalyticsProvider = (): DashboardAnalyticsProvider | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.__investmentTrackerAnalytics ?? window.__portfolioAnalytics;
};

const getPositionTransactions = (transactions: Transaction[], assetId: string, platformId: string) =>
  transactions.filter((tx) => tx.assetId === assetId && tx.platformId === platformId).sort((a, b) => a.date - b.date);

const computeCostBasis = (
  transactions: Transaction[],
  fxSnapshots: DashboardAnalyticsInput['fxSnapshots'],
): { costBasisEUR: number | null; hasSnapshotOrigin: boolean; hasUnknownCostBasis: boolean } => {
  const relevantTransactions = transactions.filter(
    (transaction) => transaction.kind === 'BUY' || transaction.kind === 'SELL' || transaction.kind === 'DEPOSIT' || transaction.kind === 'WITHDRAW' || transaction.kind === 'FEE',
  );
  const nonSnapshotTransactions = relevantTransactions.filter((transaction) => transaction.source !== 'POSITION_SNAPSHOT');
  const hasSnapshotOrigin = relevantTransactions.some((transaction) => transaction.source === 'POSITION_SNAPSHOT');

  if (nonSnapshotTransactions.length === 0) {
    return {
      costBasisEUR: null,
      hasSnapshotOrigin,
      hasUnknownCostBasis: true,
    };
  }

  let qty = 0;
  let costBasisEUR = 0;
  let hasUnknownCostBasis = false;

  for (const transaction of nonSnapshotTransactions) {
    if (transaction.kind === 'BUY') {
      const quantity = transaction.qty ?? 0;
      const price = transaction.price ?? 0;
      const grossAmount = quantity * price + (transaction.fee ?? 0);
      const amountEUR = convertToEur(grossAmount, transaction.currency, transaction.date, fxSnapshots);
      if (amountEUR === null) {
        hasUnknownCostBasis = true;
        continue;
      }
      qty += quantity;
      costBasisEUR += amountEUR;
      continue;
    }

    if (transaction.kind === 'SELL') {
      const quantity = transaction.qty ?? 0;
      if (qty <= 0) {
        hasUnknownCostBasis = true;
        continue;
      }
      const averageCost = costBasisEUR / qty;
      costBasisEUR = Math.max(0, costBasisEUR - averageCost * quantity);
      qty = Math.max(0, qty - quantity);
      continue;
    }

    if (transaction.kind === 'FEE') {
      const feeAmount = transaction.fee ?? 0;
      const feeEUR = convertToEur(feeAmount, transaction.currency, transaction.date, fxSnapshots);
      if (feeEUR === null) {
        hasUnknownCostBasis = true;
        continue;
      }
      costBasisEUR += feeEUR;
      continue;
    }

    if (transaction.kind === 'DEPOSIT' || transaction.kind === 'WITHDRAW') {
      hasUnknownCostBasis = true;
    }
  }

  if (qty <= 0) {
    return {
      costBasisEUR: 0,
      hasSnapshotOrigin,
      hasUnknownCostBasis,
    };
  }

  return {
    costBasisEUR,
    hasSnapshotOrigin,
    hasUnknownCostBasis,
  };
};

const buildHoldingInsights = (
  summary: PortfolioSummary,
  transactions: Transaction[],
  fxSnapshots: DashboardAnalyticsInput['fxSnapshots'],
): HoldingInsight[] => {
  return summary.positions.map((position) => {
    const relevantTransactions = getPositionTransactions(transactions, position.assetId, position.platformId);
    const costBasisResult = computeCostBasis(relevantTransactions, fxSnapshots);

    const unrealizedGainEUR =
      costBasisResult.costBasisEUR !== null && position.valueEUR !== null
        ? position.valueEUR - costBasisResult.costBasisEUR
        : null;
    const unrealizedGainPct =
      unrealizedGainEUR !== null && costBasisResult.costBasisEUR !== null && costBasisResult.costBasisEUR > 0
        ? (unrealizedGainEUR / costBasisResult.costBasisEUR) * 100
        : null;

    let missingDataReason: string | null = null;
    if (position.valueEUR === null) {
      missingDataReason = position.latestPrice === null ? 'Missing price' : 'Missing FX';
    } else if (costBasisResult.costBasisEUR === null) {
      missingDataReason = costBasisResult.hasSnapshotOrigin ? 'Snapshot-only position' : 'Missing cost basis';
    }

    return {
      ...position,
      costBasisEUR: costBasisResult.costBasisEUR,
      unrealizedGainEUR,
      unrealizedGainPct,
      missingDataReason,
      hasSnapshotOrigin: costBasisResult.hasSnapshotOrigin,
    };
  });
};

const reduceHoldings = (
  holdings: HoldingInsight[],
  keySelector: (holding: HoldingInsight) => string,
  labelSelector: (holding: HoldingInsight) => string,
): BucketInsight[] => {
  const map = new Map<string, BucketInsight>();

  for (const holding of holdings) {
    const key = keySelector(holding);
    const existing = map.get(key);
    const valueEUR = holding.valueEUR;
    const costBasisEUR = holding.costBasisEUR;
    const unrealizedGainEUR = holding.unrealizedGainEUR;

    if (!existing) {
      map.set(key, {
        id: key,
        label: labelSelector(holding),
        count: 1,
        valueEUR,
        costBasisEUR,
        unrealizedGainEUR,
        unrealizedGainPct: holding.unrealizedGainPct,
      });
      continue;
    }

    existing.count += 1;
    if (existing.valueEUR === null || valueEUR === null) {
      existing.valueEUR = null;
    } else {
      existing.valueEUR += valueEUR;
    }
    if (existing.costBasisEUR === null || costBasisEUR === null) {
      existing.costBasisEUR = null;
    } else {
      existing.costBasisEUR += costBasisEUR;
    }
    if (existing.unrealizedGainEUR === null || unrealizedGainEUR === null) {
      existing.unrealizedGainEUR = null;
    } else {
      existing.unrealizedGainEUR += unrealizedGainEUR;
    }
  }

  return Array.from(map.values())
    .map((bucket) => {
      const pct =
        bucket.unrealizedGainEUR !== null && bucket.costBasisEUR !== null && bucket.costBasisEUR > 0
          ? (bucket.unrealizedGainEUR / bucket.costBasisEUR) * 100
          : null;
      return { ...bucket, unrealizedGainPct: pct };
    })
    .sort((a, b) => {
      const left = a.valueEUR ?? -Infinity;
      const right = b.valueEUR ?? -Infinity;
      if (left === right) {
        return a.label.localeCompare(b.label);
      }
      return right - left;
    });
};

const buildIssues = (input: {
  holdings: HoldingInsight[];
  summary: PortfolioSummary;
}): DashboardIssue[] => {
  const issues: DashboardIssue[] = [];
  const missingPriceCount = input.holdings.filter((holding) => holding.latestPrice === null).length;
  const missingFxCount = input.holdings.filter((holding) => holding.latestPrice !== null && holding.fxRate === null).length;
  const missingCostBasisCount = input.holdings.filter((holding) => holding.costBasisEUR === null).length;
  const snapshotOnlyCount = input.holdings.filter((holding) => holding.hasSnapshotOrigin && holding.costBasisEUR === null).length;

  if (missingPriceCount > 0) {
    issues.push({
      id: 'missing-price',
      severity: 'warn',
      title: `${missingPriceCount} holding${missingPriceCount > 1 ? 's' : ''} without a price`,
      detail: 'Live price sync or manual price snapshots are needed for a complete valuation.',
    });
  }

  if (missingFxCount > 0) {
    issues.push({
      id: 'missing-fx',
      severity: 'warn',
      title: `${missingFxCount} holding${missingFxCount > 1 ? 's' : ''} without FX coverage`,
      detail: 'The asset price is known, but the currency conversion to EUR is missing.',
    });
  }

  if (snapshotOnlyCount > 0) {
    issues.push({
      id: 'snapshot-only',
      severity: 'critical',
      title: `${snapshotOnlyCount} snapshot-driven position${snapshotOnlyCount > 1 ? 's' : ''} lack cost basis`,
      detail: 'These positions are visible, but PRU / performance cannot be trusted until the original trades are imported.',
    });
  } else if (missingCostBasisCount > 0) {
    issues.push({
      id: 'missing-cost-basis',
      severity: 'warn',
      title: `${missingCostBasisCount} holding${missingCostBasisCount > 1 ? 's' : ''} need a cost basis`,
      detail: 'The dashboard can show value, but not full P&L, until acquisition history is present.',
    });
  }

  const historyMissing = input.summary.history.some((point) => point.hasMissingData);
  if (historyMissing) {
    issues.push({
      id: 'history-missing',
      severity: 'info',
      title: 'Portfolio history contains gaps',
      detail: 'Some historical valuation points are incomplete because price or FX data is missing on those dates.',
    });
  }

  if (input.holdings.length === 0) {
    issues.push({
      id: 'empty-portfolio',
      severity: 'info',
      title: 'No holdings yet',
      detail: 'Import a CSV file to populate the portfolio and unlock the analytics panels.',
    });
  }

  return issues;
};

const buildAnalyticsFallback = (input: DashboardAnalyticsInput): DashboardSnapshot => {
  const holdings = buildHoldingInsights(input.summary, input.transactions, input.fxSnapshots);
  const byTicker = reduceHoldings(holdings, (holding) => holding.assetId, (holding) => holding.asset.symbol);
  const byPlatform = reduceHoldings(holdings, (holding) => holding.platformId, (holding) => holding.platform.name);
  const byType = reduceHoldings(holdings, (holding) => holding.asset.type, (holding) => holding.asset.type);

  const winners = holdings
    .filter((holding) => holding.unrealizedGainPct !== null)
    .sort((a, b) => {
      const left = b.unrealizedGainPct ?? -Infinity;
      const right = a.unrealizedGainPct ?? -Infinity;
      if (left === right) {
        return (b.unrealizedGainEUR ?? -Infinity) - (a.unrealizedGainEUR ?? -Infinity);
      }
      return left - right;
    })
    .slice(0, 3);

  const losers = holdings
    .filter((holding) => holding.unrealizedGainPct !== null)
    .sort((a, b) => {
      const left = a.unrealizedGainPct ?? Infinity;
      const right = b.unrealizedGainPct ?? Infinity;
      if (left === right) {
        return (a.unrealizedGainEUR ?? Infinity) - (b.unrealizedGainEUR ?? Infinity);
      }
      return left - right;
    })
    .slice(0, 3);

  const allMarketDataCovered = holdings.every((holding) => holding.valueEUR !== null);
  const allCostBasisCovered = holdings.every((holding) => holding.costBasisEUR !== null);
  const totalCostBasisEUR = holdings.length > 0 && allMarketDataCovered && allCostBasisCovered
    ? holdings.reduce((sum, holding) => sum + (holding.costBasisEUR ?? 0), 0)
    : null;
  const unrealizedGainEUR =
    totalCostBasisEUR !== null && input.summary.totalValueEUR !== null
      ? input.summary.totalValueEUR - totalCostBasisEUR
      : null;
  const hasPositiveCostBasis = totalCostBasisEUR !== null && totalCostBasisEUR > 0;
  const unrealizedGainPct =
    unrealizedGainEUR !== null && hasPositiveCostBasis ? (unrealizedGainEUR / totalCostBasisEUR) * 100 : null;

  const missingPriceCount = holdings.filter((holding) => holding.latestPrice === null).length;
  const missingFxCount = holdings.filter((holding) => holding.latestPrice !== null && holding.fxRate === null).length;
  const missingCostBasisCount = holdings.filter((holding) => holding.costBasisEUR === null).length;

  return {
    metrics: {
      totalValueEUR: input.summary.totalValueEUR,
      totalCostBasisEUR,
      unrealizedGainEUR,
      unrealizedGainPct,
      positionCount: input.summary.positions.length,
      valuedPositionCount: holdings.filter((holding) => holding.valueEUR !== null).length,
      missingPriceCount,
      missingFxCount,
      missingCostBasisCount,
    },
    holdings,
    byTicker,
    byPlatform,
    byType,
    winners,
    losers,
    issues: buildIssues({ holdings, summary: input.summary }),
    allocationScope: 'Platform',
  };
};

const getBucketTone = (value: number | null) => {
  if (value === null) {
    return 'text-stone-300';
  }
  return value >= 0 ? 'text-emerald-300' : 'text-rose-300';
};

const SeverityPill: React.FC<{ severity: DashboardSeverity }> = ({ severity }) => {
  const classes =
    severity === 'critical'
      ? 'border-rose-300/30 bg-rose-500/15 text-rose-100'
      : severity === 'warn'
        ? 'border-amber-300/30 bg-amber-500/15 text-amber-100'
        : 'border-slate-300/20 bg-slate-500/15 text-slate-100';

  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${classes}`}>{severity}</span>;
};

const MetricCard: React.FC<{
  label: string;
  value: string;
  helper?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warn';
}> = ({ label, value, helper, tone = 'neutral' }) => {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-200'
      : tone === 'negative'
        ? 'text-rose-200'
        : tone === 'warn'
          ? 'text-amber-100'
          : 'text-stone-100';

  return (
    <div className="glass-card animate-fade-up rounded-2xl p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-stone-300">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {helper ? <p className="mt-2 text-xs text-stone-300">{helper}</p> : null}
    </div>
  );
};

const SectionShell: React.FC<{
  title: string;
  subtitle?: string;
  delayClassName?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, delayClassName = 'animate-fade-up', children }) => (
  <div className={`glass-card ${delayClassName} overflow-hidden rounded-2xl`}>
    <div className="border-b border-stone-300/15 px-6 py-4">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-stone-300">{subtitle}</p> : null}
    </div>
    <div>{children}</div>
  </div>
);

const IssueList: React.FC<{ issues: DashboardIssue[] }> = ({ issues }) => (
  <div className="glass-card animate-fade-up rounded-2xl p-5">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-white">Data quality</h3>
        <p className="mt-1 text-xs text-stone-300">Import gaps, missing market data, and positions that need review.</p>
      </div>
      <span className="rounded-full border border-stone-300/20 bg-stone-100/5 px-3 py-1 text-xs text-stone-200">
        {issues.length} issue{issues.length > 1 ? 's' : ''}
      </span>
    </div>
    <div className="mt-4 space-y-3">
      {issues.length === 0 ? (
        <p className="text-sm text-stone-300">No known data quality issues.</p>
      ) : (
        issues.map((issue) => (
          <div key={issue.id} className="rounded-xl border border-stone-300/10 bg-emerald-950/35 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{issue.title}</p>
                <p className="mt-1 text-xs text-stone-300">{issue.detail}</p>
              </div>
              <SeverityPill severity={issue.severity} />
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

const AllocationList: React.FC<{
  title: string;
  subtitle: string;
  buckets: BucketInsight[];
}> = ({ title, subtitle, buckets }) => {
  const visible = buckets.filter((bucket) => bucket.valueEUR !== null);
  const maxValue = Math.max(0, ...visible.map((bucket) => bucket.valueEUR ?? 0));

  return (
    <SectionShell title={title} subtitle={subtitle} delayClassName="animate-fade-up animate-delay-2">
      <div className="p-6">
        {visible.length === 0 ? (
          <p className="text-sm text-stone-300">No valued allocation data yet.</p>
        ) : (
          <div className="space-y-4">
            {visible.map((bucket) => {
              const width = maxValue > 0 ? Math.max(6, ((bucket.valueEUR ?? 0) / maxValue) * 100) : 6;
              return (
                <div key={bucket.id}>
                  <div className="mb-1 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <p className="font-medium text-stone-100">{bucket.label}</p>
                      <p className="text-stone-300">
                        {bucket.count} line{bucket.count > 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">{formatCurrency(bucket.valueEUR ?? 0)}</p>
                      {bucket.unrealizedGainEUR !== null ? (
                        <p className={getBucketTone(bucket.unrealizedGainEUR)}>
                          {formatSignedCurrency(bucket.unrealizedGainEUR)} / {bucket.unrealizedGainPct !== null ? formatPercent(bucket.unrealizedGainPct) : 'n/a'}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-emerald-950/70">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-stone-200 to-emerald-300 transition-all duration-700"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SectionShell>
  );
};

const PerformancePanel: React.FC<{
  title: string;
  holdings: HoldingInsight[];
}> = ({ title, holdings }) => {
  const visible = holdings.filter((holding) => holding.unrealizedGainPct !== null);

  return (
    <SectionShell title={title} subtitle="Ranking based on unrealized gain / loss" delayClassName="animate-fade-up animate-delay-2">
      <div className="grid gap-4 p-6 md:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-300">Top performers</h4>
          <div className="mt-3 space-y-3">
            {visible.length === 0 ? (
              <p className="text-sm text-stone-300">No cost basis available yet.</p>
            ) : (
              visible
                .slice()
                .sort((a, b) => (b.unrealizedGainPct ?? -Infinity) - (a.unrealizedGainPct ?? -Infinity))
                .slice(0, 3)
                .map((holding) => (
                  <div key={`${holding.assetId}:${holding.platformId}`} className="rounded-xl border border-stone-300/10 bg-emerald-950/30 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{holding.asset.symbol}</p>
                        <p className="text-xs text-stone-300">{holding.platform.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-emerald-200">{formatPercent(holding.unrealizedGainPct ?? 0)}</p>
                        <p className="text-xs text-stone-300">{holding.unrealizedGainEUR !== null ? formatSignedCurrency(holding.unrealizedGainEUR) : 'n/a'}</p>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-300">Weakest performers</h4>
          <div className="mt-3 space-y-3">
            {visible.length === 0 ? (
              <p className="text-sm text-stone-300">No cost basis available yet.</p>
            ) : (
              visible
                .slice()
                .sort((a, b) => (a.unrealizedGainPct ?? Infinity) - (b.unrealizedGainPct ?? Infinity))
                .slice(0, 3)
                .map((holding) => (
                  <div key={`${holding.assetId}:${holding.platformId}`} className="rounded-xl border border-stone-300/10 bg-emerald-950/30 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{holding.asset.symbol}</p>
                        <p className="text-xs text-stone-300">{holding.platform.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-rose-200">{formatPercent(holding.unrealizedGainPct ?? 0)}</p>
                        <p className="text-xs text-stone-300">{holding.unrealizedGainEUR !== null ? formatSignedCurrency(holding.unrealizedGainEUR) : 'n/a'}</p>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </SectionShell>
  );
};

const PortfolioEvolutionChart: React.FC<{ history: PortfolioHistoryPoint[] }> = ({ history }) => {
  const points = history.filter((entry) => entry.totalValueEUR !== null);

  if (points.length < 2) {
    return (
      <SectionShell
        title="Portfolio evolution"
        subtitle="Add more dated prices or transactions to visualize portfolio evolution over time."
        delayClassName="animate-fade-up animate-delay-1"
      >
        <div className="p-6">
          <p className="text-sm text-stone-300">The chart becomes useful once the portfolio has enough dated data points.</p>
        </div>
      </SectionShell>
    );
  }

  const width = 920;
  const height = 320;
  const padding = 32;
  const values = points.map((entry) => entry.totalValueEUR as number);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || Math.max(1, maxValue * 0.02);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const toX = (index: number) => {
    if (points.length <= 1) return padding;
    return padding + (index / (points.length - 1)) * usableWidth;
  };

  const toY = (value: number) => height - padding - ((value - minValue) / range) * usableHeight;

  const linePoints = points.map((entry, index) => `${toX(index)},${toY(entry.totalValueEUR as number)}`);
  const linePath = `M ${linePoints.join(' L ')}`;
  const areaPath = `${linePath} L ${toX(points.length - 1)},${height - padding} L ${padding},${height - padding} Z`;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const growth = (lastPoint.totalValueEUR as number) - (firstPoint.totalValueEUR as number);
  const growthPct =
    Math.abs(firstPoint.totalValueEUR as number) < 1e-9
      ? 0
      : (growth / (firstPoint.totalValueEUR as number)) * 100;

  return (
    <SectionShell
      title="Portfolio evolution"
      subtitle="Consolidated value through buy/sell movements"
      delayClassName="animate-fade-up animate-delay-1"
    >
      <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-6 shadow-2xl shadow-emerald-950/30">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-stone-200">History overview</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-stone-300">Latest</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(lastPoint.totalValueEUR as number)}</p>
            <p className={`text-sm font-medium ${growth >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {formatSignedCurrency(growth)} ({formatSignedNumber(growthPct)}%)
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-72 w-full min-w-[720px]">
            <defs>
              <linearGradient id="portfolioAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f5f5f0" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#f5f5f0" stopOpacity="0.04" />
              </linearGradient>
              <linearGradient id="portfolioLineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#d9ead3" />
                <stop offset="100%" stopColor="#4ade80" />
              </linearGradient>
            </defs>

            {[0, 1, 2, 3].map((tick) => {
              const y = padding + (usableHeight / 3) * tick;
              return (
                <line
                  key={tick}
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke="rgba(148, 163, 184, 0.3)"
                  strokeWidth="1"
                />
              );
            })}

            <path d={areaPath} fill="url(#portfolioAreaGradient)" />
            <path
              d={linePath}
              fill="none"
              stroke="url(#portfolioLineGradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="line-draw"
            />

            {linePoints.map((point, index) => {
              if (index !== 0 && index !== linePoints.length - 1) return null;
              const [cx, cy] = point.split(',').map(Number);
              return <circle key={index} cx={cx} cy={cy} r="5" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />;
            })}
          </svg>
        </div>

        <div className="mt-2 flex justify-between text-xs text-stone-300">
          <span>{new Date(firstPoint.date).toLocaleDateString()}</span>
          <span>{new Date(lastPoint.date).toLocaleDateString()}</span>
        </div>
      </div>
    </SectionShell>
  );
};

const buildMonthlyChanges = (history: PortfolioHistoryPoint[]) => {
  const known = history
    .filter((entry) => entry.totalValueEUR !== null)
    .sort((a, b) => a.date - b.date);
  const lastByMonth = new Map<string, number>();

  for (const point of known) {
    const date = new Date(point.date);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    lastByMonth.set(key, point.totalValueEUR as number);
  }

  const monthly = Array.from(lastByMonth.entries())
    .map(([monthKey, value]) => ({ monthKey, value }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const changes: Array<{ month: string; delta: number }> = [];
  for (let index = 1; index < monthly.length; index += 1) {
    const current = monthly[index];
    const previous = monthly[index - 1];
    const date = new Date(`${current.monthKey}-01T00:00:00Z`);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    changes.push({
      month,
      delta: current.value - previous.value,
    });
  }

  return changes.slice(-8);
};

const MonthlyChangeBars: React.FC<{ history: PortfolioHistoryPoint[] }> = ({ history }) => {
  const changes = buildMonthlyChanges(history);

  if (changes.length === 0) {
    return (
      <SectionShell
        title="Monthly momentum"
        subtitle="Add at least two months of valuation history to see month-over-month changes."
        delayClassName="animate-fade-up animate-delay-2"
      >
        <div className="p-6">
          <p className="text-sm text-stone-300">The panel will light up once the timeline has enough points.</p>
        </div>
      </SectionShell>
    );
  }

  const maxAbs = Math.max(1, ...changes.map((entry) => Math.abs(entry.delta)));

  return (
    <SectionShell
      title="Monthly momentum"
      subtitle="Month-over-month change in total portfolio value"
      delayClassName="animate-fade-up animate-delay-2"
    >
      <div className="p-6">
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {changes.map((entry) => {
            const height = Math.max(8, (Math.abs(entry.delta) / maxAbs) * 88);
            const positive = entry.delta >= 0;
            return (
              <div key={entry.month} className="flex flex-col items-center gap-1">
                <div className="flex h-24 w-8 items-end rounded bg-emerald-950/60 p-1">
                  <div
                    className={`w-full rounded ${positive ? 'bg-emerald-300' : 'bg-rose-300'}`}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="text-[10px] text-stone-300">{entry.month}</span>
                <span className={`text-[10px] ${positive ? 'text-emerald-200' : 'text-rose-200'}`}>
                  {formatSignedCurrency(entry.delta, 'EUR')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
};

const Dashboard: React.FC = () => {
  const platforms = usePlatformStore((s) => s.platforms);
  const fetchPlatforms = usePlatformStore((s) => s.fetchPlatforms);

  const assets = useAssetStore((s) => s.assets);
  const fetchAssets = useAssetStore((s) => s.fetchAssets);
  const updateAsset = useAssetStore((s) => s.updateAsset);

  const transactions = useTransactionStore((s) => s.transactions);
  const fetchTransactions = useTransactionStore((s) => s.fetchTransactions);

  const prices = usePriceStore((s) => s.prices);
  const fetchPrices = usePriceStore((s) => s.fetchPrices);
  const addPrice = usePriceStore((s) => s.addPrice);

  const fxSnapshots = useFxStore((s) => s.fxSnapshots);
  const fetchFxSnapshots = useFxStore((s) => s.fetchFxSnapshots);
  const addFxSnapshot = useFxStore((s) => s.addFxSnapshot);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [externalAnalytics, setExternalAnalytics] = useState<DashboardSnapshot | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          fetchPlatforms(),
          fetchAssets(),
          fetchTransactions(),
          fetchPrices(),
          fetchFxSnapshots(),
        ]);
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load dashboard data.';
        setError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [fetchPlatforms, fetchAssets, fetchTransactions, fetchPrices, fetchFxSnapshots]);

  const summary = useMemo(
    () => computePortfolioSummary(assets, transactions, prices, fxSnapshots, platforms),
    [assets, transactions, prices, fxSnapshots, platforms],
  );

  const analyticsInput = useMemo<DashboardAnalyticsInput>(
    () => ({
      summary,
      transactions,
      assets,
      platforms,
      prices,
      fxSnapshots,
    }),
    [summary, transactions, assets, platforms, prices, fxSnapshots],
  );

  useEffect(() => {
    let isMounted = true;
    const provider = getDashboardAnalyticsProvider();
    const compute = provider?.computeSnapshot;

    if (!compute) {
      setExternalAnalytics(null);
      return;
    }

    Promise.resolve(compute(analyticsInput))
      .then((snapshot) => {
        if (isMounted) {
          setExternalAnalytics(snapshot);
        }
      })
      .catch(() => {
        if (isMounted) {
          setExternalAnalytics(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [analyticsInput]);

  const analytics = externalAnalytics ?? buildAnalyticsFallback(analyticsInput);
  const missingMarketDataCount = analytics.metrics.missingPriceCount + analytics.metrics.missingFxCount;
  const portfolioCoverage =
    analytics.metrics.positionCount === 0
      ? 0
      : Math.round((analytics.metrics.valuedPositionCount / analytics.metrics.positionCount) * 100);
  const activeHoldingCount = analytics.holdings.filter((holding) => Math.abs(holding.qty) > 1e-12).length;
  const representativeHoldingsByAssetId = useMemo(() => {
    const map = new Map<string, HoldingInsight>();
    for (const holding of analytics.holdings) {
      if (!map.has(holding.assetId)) {
        map.set(holding.assetId, holding);
      }
    }
    return map;
  }, [analytics.holdings]);
  const totalQtyByAssetId = useMemo(() => {
    const map = new Map<string, number>();
    for (const holding of analytics.holdings) {
      map.set(holding.assetId, (map.get(holding.assetId) ?? 0) + holding.qty);
    }
    return map;
  }, [analytics.holdings]);

  const handleSyncLiveData = async () => {
    if (!assets.length || syncing) {
      return;
    }

    setSyncing(true);
    setSyncMessage(null);

    try {
      const quoteResult = await fetchLiveQuotes(assets);
      const now = Date.now();

      for (let i = 0; i < quoteResult.quotes.length; i += 1) {
        const quote = quoteResult.quotes[i];
        const relatedAsset = assets.find((asset) => asset.id === quote.assetId);
        if (relatedAsset && relatedAsset.currency !== quote.currency) {
          await updateAsset(relatedAsset.id, { currency: quote.currency });
        }
        await addPrice({
          id: `price_live_${quote.assetId}_${quote.date}_${i}_${now}`,
          assetId: quote.assetId,
          date: quote.date,
          price: quote.price,
          currency: quote.currency,
        });
      }

      const allCurrencies = Array.from(
        new Set([
          ...assets.map((asset) => asset.currency),
          ...quoteResult.quotes.map((quote) => quote.currency),
        ]),
      );
      const fxResult = await fetchFxRatesToEur(allCurrencies);

      const fxEntries = Object.entries(fxResult.rates);
      for (let i = 0; i < fxEntries.length; i += 1) {
        const [currency, rate] = fxEntries[i];
        await addFxSnapshot({
          id: `fx_live_${currency}_${now}_${i}`,
          pair: `${currency}/EUR`,
          date: now,
          rate,
        });
      }

      await Promise.all([fetchPrices(), fetchFxSnapshots(), fetchAssets()]);

      const messageParts = [
        `${quoteResult.quotes.length}/${assets.length} live prices synced`,
        `${fxEntries.length} FX rates synced`,
      ];
      if (quoteResult.errors.length) {
        messageParts.push(`${quoteResult.errors.length} tickers unresolved`);
      }
      if (fxResult.errors.length) {
        messageParts.push(`${fxResult.errors.length} FX pairs unresolved`);
      }
      setSyncMessage(`${messageParts.join(' | ')}.`);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Live sync failed.';
      setSyncMessage(`Live sync failed: ${message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="py-6 text-center text-stone-300">Loading...</div>;
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeading
          title="Dashboard"
          subtitle="Portfolio value, cost basis, performance, and live market coverage"
        />
        <button
          type="button"
          onClick={handleSyncLiveData}
          disabled={syncing || assets.length === 0}
          className="h-fit rounded-lg border border-stone-100/50 bg-stone-100 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? 'Syncing live data...' : 'Sync live prices & FX'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {syncMessage && (
        <div className="rounded-md border border-emerald-200/35 bg-emerald-500/10 px-4 py-3 text-sm text-stone-100">
          {syncMessage}
        </div>
      )}

      <div className="rounded-3xl border border-stone-300/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-6 shadow-2xl shadow-emerald-950/30">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-300">Investment overview</p>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
              Stocks and crypto, with cost basis and P&L
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-200">
              The dashboard is centered on portfolio value, acquisition cost, unrealized gain / loss, and data quality so the imported ledger stays explainable.
            </p>
          </div>

          <div className="grid gap-3 rounded-2xl border border-stone-300/10 bg-emerald-950/35 p-4 text-sm text-stone-200 sm:grid-cols-2 lg:min-w-[320px]">
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-300">Coverage</p>
              <p className="mt-1 text-2xl font-semibold text-white">{portfolioCoverage}%</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-300">Holdings</p>
              <p className="mt-1 text-2xl font-semibold text-white">{activeHoldingCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-300">Platforms</p>
              <p className="mt-1 text-2xl font-semibold text-white">{summary.byPlatform.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-300">Issues</p>
              <p className="mt-1 text-2xl font-semibold text-white">{analytics.issues.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Portfolio value"
          value={summary.totalValueEUR !== null ? formatCurrency(summary.totalValueEUR) : 'Missing market data'}
          helper="Current market value in EUR"
          tone={summary.totalValueEUR !== null ? 'positive' : 'warn'}
        />
        <MetricCard
          label="Cost basis"
          value={analytics.metrics.totalCostBasisEUR !== null ? formatCurrency(analytics.metrics.totalCostBasisEUR) : 'Missing cost basis'}
          helper="Acquisition cost for open positions"
          tone={analytics.metrics.totalCostBasisEUR !== null ? 'neutral' : 'warn'}
        />
        <MetricCard
          label="Unrealized P&L"
          value={analytics.metrics.unrealizedGainEUR !== null ? formatSignedCurrency(analytics.metrics.unrealizedGainEUR) : 'Missing P&L'}
          helper={analytics.metrics.unrealizedGainPct !== null ? formatPercent(analytics.metrics.unrealizedGainPct) : 'Need cost basis + valuation'}
          tone={analytics.metrics.unrealizedGainEUR !== null ? (analytics.metrics.unrealizedGainEUR >= 0 ? 'positive' : 'negative') : 'warn'}
        />
        <MetricCard
          label="Market coverage"
          value={`${portfolioCoverage}%`}
          helper={`${analytics.metrics.valuedPositionCount}/${analytics.metrics.positionCount} positions priced`}
          tone={missingMarketDataCount === 0 ? 'positive' : 'warn'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        <PortfolioEvolutionChart history={summary.history} />
        <IssueList issues={analytics.issues} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PerformancePanel title="Winners and losers" holdings={analytics.holdings} />
        <MonthlyChangeBars history={summary.history} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AllocationList
          title={`Allocation by ${analytics.allocationScope.toLowerCase()}`}
          subtitle="Breakdown of current market value, cost basis, and P&L"
          buckets={analytics.byPlatform}
        />
        <AllocationList
          title="Allocation by asset type"
          subtitle="ETF, stock, and crypto exposure in one view"
          buckets={analytics.byType}
        />
      </div>

      <SectionShell
        title="Net holdings by ticker"
        subtitle="One consolidated line per ticker across all platforms"
        delayClassName="animate-fade-up animate-delay-3"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-emerald-950/55 text-stone-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Ticker</th>
                <th className="px-6 py-3 text-left font-semibold">Asset</th>
                <th className="px-6 py-3 text-right font-semibold">Net Qty</th>
                <th className="px-6 py-3 text-right font-semibold">Price</th>
                <th className="px-6 py-3 text-right font-semibold">Cost basis</th>
                <th className="px-6 py-3 text-right font-semibold">P&L</th>
                <th className="px-6 py-3 text-right font-semibold">Value EUR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/40">
              {analytics.byTicker.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-stone-300">
                    No holdings yet
                  </td>
                </tr>
              ) : (
                analytics.byTicker.map((holding) => {
                  const representative = representativeHoldingsByAssetId.get(holding.id);
                  return (
                    <tr key={holding.id} className="transition hover:bg-emerald-950/45">
                      <td className="px-6 py-4 font-semibold text-white">{holding.label}</td>
                      <td className="px-6 py-4 text-stone-200">
                        <div className="font-medium text-stone-100">
                          {representative?.asset.name ?? holding.label}
                        </div>
                        <div className="text-xs text-stone-300">
                          {holding.count} position{holding.count > 1 ? 's' : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-stone-100">
                        {formatCompactQty(totalQtyByAssetId.get(holding.id) ?? 0)}
                      </td>
                      <td className="px-6 py-4 text-right text-stone-100">
                        {representative?.latestPrice !== null && representative?.latestPrice !== undefined
                          ? `${representative.asset.currency} ${representative.latestPrice.toFixed(2)}`
                          : 'Missing price'}
                      </td>
                      <td className="px-6 py-4 text-right text-stone-100">
                        {holding.costBasisEUR !== null ? formatCurrency(holding.costBasisEUR) : 'Missing cost basis'}
                      </td>
                      <td className={`px-6 py-4 text-right font-semibold ${getBucketTone(holding.unrealizedGainEUR)}`}>
                        {holding.unrealizedGainEUR !== null ? formatSignedCurrency(holding.unrealizedGainEUR) : 'Missing P&L'}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-white">
                        {holding.valueEUR !== null ? formatCurrency(holding.valueEUR) : 'Missing data'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionShell>

      <SectionShell
        title="All positions by platform"
        subtitle="Platform-level view with cost basis and unrealized P&L"
        delayClassName="animate-fade-up animate-delay-3"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-emerald-950/55 text-stone-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Asset</th>
                <th className="px-6 py-3 text-left font-semibold">Platform</th>
                <th className="px-6 py-3 text-left font-semibold">Type</th>
                <th className="px-6 py-3 text-right font-semibold">Qty</th>
                <th className="px-6 py-3 text-right font-semibold">Cost basis</th>
                <th className="px-6 py-3 text-right font-semibold">P&L</th>
                <th className="px-6 py-3 text-right font-semibold">Value EUR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/40">
              {analytics.holdings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-stone-300">
                    No positions yet
                  </td>
                </tr>
              ) : (
                analytics.holdings.map((position) => (
                  <tr key={`${position.assetId}:${position.platformId}`} className="transition hover:bg-emerald-950/45">
                    <td className="px-6 py-4 text-stone-100">
                      <div>{position.asset.name}</div>
                      <div className="text-xs text-stone-300">{position.asset.symbol}</div>
                    </td>
                    <td className="px-6 py-4 text-stone-200">{position.platform.name}</td>
                    <td className="px-6 py-4 text-stone-200">{position.asset.type}</td>
                    <td className="px-6 py-4 text-right text-stone-100">{formatCompactQty(position.qty)}</td>
                    <td className="px-6 py-4 text-right text-stone-100">
                      {position.costBasisEUR !== null ? formatCurrency(position.costBasisEUR) : 'Missing cost basis'}
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold ${getBucketTone(position.unrealizedGainEUR)}`}>
                      {position.unrealizedGainEUR !== null ? formatSignedCurrency(position.unrealizedGainEUR) : 'Missing P&L'}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-white">
                      {position.valueEUR !== null ? formatCurrency(position.valueEUR) : 'Missing data'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionShell>
    </div>
  );
};

export default Dashboard;
