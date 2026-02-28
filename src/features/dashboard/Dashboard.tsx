import React, { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';
import { computePortfolioSummary } from '../../lib/computations';
import { PortfolioHistoryPoint } from '../../types';
import { fetchFxRatesToEur, fetchLiveQuotes } from '../../lib/liveMarketData';

const formatEUR = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const StatCard: React.FC<{ label: string; value: string; tone?: 'neutral' | 'positive' | 'warn' }> = ({
  label,
  value,
  tone = 'neutral',
}) => {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-200'
        : 'text-stone-100';

  return (
    <div className="glass-card animate-fade-up rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-stone-300">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
};

const PortfolioEvolutionChart: React.FC<{ history: PortfolioHistoryPoint[] }> = ({ history }) => {
  const points = history.filter((entry) => entry.totalValueEUR !== null);

  if (points.length < 2) {
    return (
      <div className="glass-card animate-fade-up animate-delay-1 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white">Portfolio Evolution</h3>
        <p className="mt-2 text-sm text-stone-300">
          Add more dated prices/transactions to visualize portfolio evolution over time.
        </p>
      </div>
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

  const toY = (value: number) =>
    height - padding - ((value - minValue) / range) * usableHeight;

  const linePoints = points.map(
    (entry, index) => `${toX(index)},${toY(entry.totalValueEUR as number)}`,
  );
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
    <div className="animate-fade-up animate-delay-1 rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-6 shadow-2xl shadow-emerald-950/30">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Portfolio Evolution</h3>
          <p className="text-sm text-stone-200">Consolidated value through buy/sell movements</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-stone-300">Latest</p>
          <p className="text-2xl font-bold text-white">{formatEUR(lastPoint.totalValueEUR as number)}</p>
          <p className={`text-sm font-medium ${growth >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {growth >= 0 ? '+' : ''}
            {formatEUR(growth)} ({growthPct >= 0 ? '+' : ''}
            {growthPct.toFixed(2)}%)
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
  );
};

const HoldingsBars: React.FC<{
  holdings: ReturnType<typeof computePortfolioSummary>['byTicker'];
}> = ({ holdings }) => {
  const visible = holdings.filter((holding) => holding.valueEUR !== null).slice(0, 6);
  if (!visible.length) {
    return (
      <div className="glass-card animate-fade-up animate-delay-2 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white">Top Holdings</h3>
        <p className="mt-2 text-sm text-stone-300">Live valuation will appear here once prices and FX are available.</p>
      </div>
    );
  }

  const maxValue = Math.max(...visible.map((holding) => holding.valueEUR as number));

  return (
    <div className="glass-card animate-fade-up animate-delay-2 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white">Top Holdings</h3>
      <div className="mt-4 space-y-3">
        {visible.map((holding) => {
          const value = holding.valueEUR as number;
          const width = maxValue > 0 ? Math.max(8, (value / maxValue) * 100) : 8;
          return (
            <div key={holding.assetId}>
              <div className="mb-1 flex items-center justify-between text-xs text-stone-300">
                <span>{holding.asset.symbol}</span>
                <span>{formatEUR(value)}</span>
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
    </div>
  );
};

const ALLOCATION_COLORS = [
  '#f5f5f0',
  '#86efac',
  '#a7f3d0',
  '#99f6e4',
  '#bef264',
  '#fde68a',
  '#fca5a5',
];

const AllocationDonut: React.FC<{
  holdings: ReturnType<typeof computePortfolioSummary>['byTicker'];
}> = ({ holdings }) => {
  const visible = holdings
    .filter((holding) => holding.valueEUR !== null && (holding.valueEUR as number) > 0)
    .sort((a, b) => (b.valueEUR as number) - (a.valueEUR as number));

  if (!visible.length) {
    return (
      <div className="glass-card animate-fade-up animate-delay-2 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white">Allocation Breakdown</h3>
        <p className="mt-2 text-sm text-stone-300">No valued holdings yet.</p>
      </div>
    );
  }

  const totalValue = visible.reduce((sum, item) => sum + (item.valueEUR as number), 0);
  const top = visible.slice(0, 6);
  const topTotal = top.reduce((sum, item) => sum + (item.valueEUR as number), 0);
  const otherValue = Math.max(0, totalValue - topTotal);
  const segments: Array<{ id: string; label: string; value: number }> = [
    ...top.map((entry) => ({
      id: entry.assetId,
      label: entry.asset.symbol,
      value: entry.valueEUR as number,
    })),
  ];
  if (otherValue > 0) {
    segments.push({
      id: 'other',
      label: 'OTHER',
      value: otherValue,
    });
  }

  let cursor = 0;
  const gradients = segments.map((segment, index) => {
    const size = totalValue <= 0 ? 0 : (segment.value / totalValue) * 360;
    const start = cursor;
    const end = cursor + size;
    cursor = end;
    const color = ALLOCATION_COLORS[index % ALLOCATION_COLORS.length];
    return `${color} ${start}deg ${end}deg`;
  });

  return (
    <div className="glass-card animate-fade-up animate-delay-2 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white">Allocation Breakdown</h3>
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative mx-auto h-44 w-44">
          <div
            className="h-44 w-44 rounded-full shadow-lg shadow-emerald-950/40"
            style={{ background: `conic-gradient(${gradients.join(', ')})` }}
          />
          <div className="absolute inset-7 rounded-full bg-emerald-950/90 backdrop-blur">
            <div className="flex h-full flex-col items-center justify-center">
              <p className="text-[11px] uppercase tracking-wide text-stone-300">Total</p>
              <p className="text-sm font-semibold text-stone-100">{formatEUR(totalValue)}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {segments.map((segment, index) => {
            const pct = totalValue <= 0 ? 0 : (segment.value / totalValue) * 100;
            return (
              <div key={segment.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] }}
                  />
                  <span className="text-stone-200">{segment.label}</span>
                </div>
                <span className="text-stone-100">{pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
      <div className="glass-card animate-fade-up animate-delay-2 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white">Monthly Momentum</h3>
        <p className="mt-2 text-sm text-stone-300">
          Add at least two months of valuation history to see momentum.
        </p>
      </div>
    );
  }

  const maxAbs = Math.max(1, ...changes.map((entry) => Math.abs(entry.delta)));

  return (
    <div className="glass-card animate-fade-up animate-delay-2 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white">Monthly Momentum</h3>
      <p className="mt-1 text-xs text-stone-300">Month-over-month change in total portfolio value</p>
      <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-8">
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
                {positive ? '+' : '-'}
                {Math.abs(entry.delta).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
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
  }, [
    fetchPlatforms,
    fetchAssets,
    fetchTransactions,
    fetchPrices,
    fetchFxSnapshots,
  ]);

  const summary = useMemo(
    () => computePortfolioSummary(assets, transactions, prices, fxSnapshots, platforms),
    [assets, transactions, prices, fxSnapshots, platforms],
  );

  const missingTickerCount = summary.byTicker.filter((holding) => holding.valueEUR === null).length;

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
        <PageHeading title="Dashboard" subtitle="Portfolio overview in EUR with live market sync" />
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

      <div className="glass-card animate-fade-up rounded-2xl p-6 text-center">
        <p className="text-sm font-medium text-stone-300">Total Portfolio Value</p>
        <p className="mt-2 text-4xl font-bold text-white sm:text-5xl">
          {summary.totalValueEUR !== null ? formatEUR(summary.totalValueEUR) : 'Missing price/FX'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard label="Open positions" value={String(summary.positions.filter((p) => Math.abs(p.qty) > 1e-12).length)} />
        <StatCard label="Tickers covered" value={`${summary.byTicker.length}`} tone="positive" />
        <StatCard
          label="Missing market data"
          value={`${missingTickerCount} ticker${missingTickerCount > 1 ? 's' : ''}`}
          tone={missingTickerCount > 0 ? 'warn' : 'positive'}
        />
      </div>

      <PortfolioEvolutionChart history={summary.history} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HoldingsBars holdings={summary.byTicker} />
        <AllocationDonut holdings={summary.byTicker} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthlyChangeBars history={summary.history} />
        <div className="glass-card animate-fade-up animate-delay-2 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white">By Platform</h3>
          <div className="mt-4 space-y-3">
            {summary.byPlatform.length === 0 ? (
              <p className="text-sm text-stone-300">No platforms</p>
            ) : (
              summary.byPlatform.map((entry) => (
                <div key={entry.platformId} className="flex justify-between text-sm">
                  <span className="text-stone-200">{entry.name}</span>
                  <span className="font-semibold text-white">
                    {entry.valueEUR !== null ? formatEUR(entry.valueEUR) : 'Missing FX'}
                  </span>
                </div>
              ))
            )}
          </div>

          <h3 className="mt-8 text-lg font-semibold text-white">By Asset Type</h3>
          <div className="mt-4 space-y-3">
            {summary.byType.length === 0 ? (
              <p className="text-sm text-stone-300">No assets</p>
            ) : (
              summary.byType.map((entry) => (
                <div key={entry.type} className="flex justify-between text-sm">
                  <span className="text-stone-200">{entry.type}</span>
                  <span className="font-semibold text-white">
                    {entry.valueEUR !== null ? formatEUR(entry.valueEUR) : 'Missing FX'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="glass-card animate-fade-up animate-delay-3 overflow-hidden rounded-xl">
        <div className="border-b border-stone-300/15 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">Net Holdings by Ticker</h3>
          <p className="mt-1 text-xs text-stone-300">
            One consolidated line per ticker (BUY minus SELL across all platforms)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-emerald-950/55 text-stone-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Ticker</th>
                <th className="px-6 py-3 text-left font-semibold">Asset</th>
                <th className="px-6 py-3 text-right font-semibold">Net Qty</th>
                <th className="px-6 py-3 text-right font-semibold">Price</th>
                <th className="px-6 py-3 text-right font-semibold">FX</th>
                <th className="px-6 py-3 text-right font-semibold">Value EUR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/40">
              {summary.byTicker.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-stone-300">
                    No holdings yet
                  </td>
                </tr>
              ) : (
                summary.byTicker.map((holding) => (
                  <tr key={holding.assetId} className="transition hover:bg-emerald-950/45">
                    <td className="px-6 py-4 font-semibold text-white">{holding.asset.symbol}</td>
                    <td className="px-6 py-4 text-stone-200">{holding.asset.name}</td>
                    <td className="px-6 py-4 text-right text-stone-100">{holding.qty.toFixed(4)}</td>
                    <td className="px-6 py-4 text-right text-stone-100">
                      {holding.latestPrice !== null
                        ? `${holding.asset.currency} ${holding.latestPrice.toFixed(2)}`
                        : 'Missing price'}
                    </td>
                    <td className="px-6 py-4 text-right text-stone-100">
                      {holding.fxRate !== null ? holding.fxRate.toFixed(4) : 'Missing FX'}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-white">
                      {holding.valueEUR !== null ? formatEUR(holding.valueEUR) : 'Missing data'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card animate-fade-up animate-delay-3 overflow-hidden rounded-xl">
        <div className="border-b border-stone-300/15 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">All Positions by Platform</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-emerald-950/55 text-stone-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Asset</th>
                <th className="px-6 py-3 text-left font-semibold">Platform</th>
                <th className="px-6 py-3 text-left font-semibold">Type</th>
                <th className="px-6 py-3 text-right font-semibold">Qty</th>
                <th className="px-6 py-3 text-right font-semibold">Price</th>
                <th className="px-6 py-3 text-right font-semibold">FX Rate</th>
                <th className="px-6 py-3 text-right font-semibold">Value EUR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/40">
              {summary.positions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-stone-300">
                    No positions yet
                  </td>
                </tr>
              ) : (
                summary.positions.map((position) => (
                  <tr key={`${position.assetId}:${position.platformId}`} className="transition hover:bg-emerald-950/45">
                    <td className="px-6 py-4 text-stone-100">
                      <div>{position.asset.name}</div>
                      <div className="text-xs text-stone-300">{position.asset.symbol}</div>
                    </td>
                    <td className="px-6 py-4 text-stone-200">{position.platform.name}</td>
                    <td className="px-6 py-4 text-stone-200">{position.asset.type}</td>
                    <td className="px-6 py-4 text-right text-stone-100">{position.qty.toFixed(4)}</td>
                    <td className="px-6 py-4 text-right text-stone-100">
                      {position.latestPrice !== null
                        ? `${position.asset.currency} ${position.latestPrice.toFixed(2)}`
                        : 'Missing price'}
                    </td>
                    <td className="px-6 py-4 text-right text-stone-100">
                      {position.fxRate !== null ? position.fxRate.toFixed(4) : 'Missing FX'}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-white">
                      {position.valueEUR !== null ? formatEUR(position.valueEUR) : 'Missing data'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
