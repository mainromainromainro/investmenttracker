import React, { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { usePlatformStore } from '../../stores/platformStore';
import { useAssetStore } from '../../stores/assetStore';
import { useTransactionStore } from '../../stores/transactionStore';
import { usePriceStore } from '../../stores/priceStore';
import { useFxStore } from '../../stores/fxStore';
import { computePortfolioSummary } from '../../lib/computations';
import { PortfolioHistoryPoint } from '../../types';

const formatEUR = (value: number) => `€${value.toFixed(2)}`;

const PortfolioEvolutionChart: React.FC<{ history: PortfolioHistoryPoint[] }> = ({ history }) => {
  const points = history.filter((entry) => entry.totalValueEUR !== null);

  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Portfolio Evolution</h3>
        <p className="mt-2 text-sm text-slate-600">
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
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 p-6 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Portfolio Evolution</h3>
          <p className="text-sm text-blue-100">Consolidated value through buy/sell movements</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-blue-200">Latest</p>
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
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="portfolioLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#34d399" />
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
          />

          {linePoints.map((point, index) => {
            if (index !== 0 && index !== linePoints.length - 1) return null;
            const [cx, cy] = point.split(',').map(Number);
            return <circle key={index} cx={cx} cy={cy} r="5" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />;
          })}
        </svg>
      </div>

      <div className="mt-2 flex justify-between text-xs text-blue-100">
        <span>{new Date(firstPoint.date).toLocaleDateString()}</span>
        <span>{new Date(lastPoint.date).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const platforms = usePlatformStore((s) => s.platforms);
  const fetchPlatforms = usePlatformStore((s) => s.fetchPlatforms);

  const assets = useAssetStore((s) => s.assets);
  const fetchAssets = useAssetStore((s) => s.fetchAssets);

  const transactions = useTransactionStore((s) => s.transactions);
  const fetchTransactions = useTransactionStore((s) => s.fetchTransactions);

  const prices = usePriceStore((s) => s.prices);
  const fetchPrices = usePriceStore((s) => s.fetchPrices);

  const fxSnapshots = useFxStore((s) => s.fxSnapshots);
  const fetchFxSnapshots = useFxStore((s) => s.fetchFxSnapshots);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    [assets, transactions, prices, fxSnapshots, platforms]
  );

  if (loading) {
    return <div className="text-center py-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeading title="Dashboard" subtitle="Portfolio overview in EUR" />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center">
          <p className="text-gray-600 text-sm font-medium">Total Portfolio Value</p>
          <p className="text-5xl font-bold text-gray-900 mt-2">
            {summary.totalValueEUR !== null ? formatEUR(summary.totalValueEUR) : 'Missing price/FX'}
          </p>
        </div>
      </div>

      <PortfolioEvolutionChart history={summary.history} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By Platform</h3>
          <div className="space-y-3">
            {summary.byPlatform.length === 0 ? (
              <p className="text-gray-500 text-sm">No platforms</p>
            ) : (
              summary.byPlatform.map((entry) => (
                <div key={entry.platformId} className="flex justify-between">
                  <span className="text-gray-700">{entry.name}</span>
                  <span className="font-semibold text-gray-900">
                    {entry.valueEUR !== null ? formatEUR(entry.valueEUR) : 'Missing FX'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By Asset Type</h3>
          <div className="space-y-3">
            {summary.byType.length === 0 ? (
              <p className="text-gray-500 text-sm">No assets</p>
            ) : (
              summary.byType.map((entry) => (
                <div key={entry.type} className="flex justify-between">
                  <span className="text-gray-700">{entry.type}</span>
                  <span className="font-semibold text-gray-900">
                    {entry.valueEUR !== null ? formatEUR(entry.valueEUR) : 'Missing FX'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Net Holdings by Ticker</h3>
          <p className="text-xs text-gray-500 mt-1">
            One consolidated line per ticker (BUY minus SELL across all platforms)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Ticker</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Asset</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Net Qty</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Price</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">FX</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Value EUR</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.byTicker.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No holdings yet
                  </td>
                </tr>
              ) : (
                summary.byTicker.map((holding) => (
                  <tr key={holding.assetId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{holding.asset.symbol}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{holding.asset.name}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">{holding.qty.toFixed(4)}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {holding.latestPrice !== null
                        ? `${holding.asset.currency} ${holding.latestPrice.toFixed(2)}`
                        : 'Missing price'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {holding.fxRate !== null ? holding.fxRate.toFixed(4) : 'Missing FX'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                      {holding.valueEUR !== null ? formatEUR(holding.valueEUR) : 'Missing data'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">All Positions by Platform</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Asset</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Platform</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Qty</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Price</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">FX Rate</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Value EUR</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.positions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No positions yet
                  </td>
                </tr>
              ) : (
                summary.positions.map((position) => (
                  <tr key={`${position.assetId}:${position.platformId}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>{position.asset.name}</div>
                      <div className="text-gray-500 text-xs">{position.asset.symbol}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{position.platform.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{position.asset.type}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">{position.qty.toFixed(4)}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {position.latestPrice !== null
                        ? `${position.asset.currency} ${position.latestPrice.toFixed(2)}`
                        : 'Missing price'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {position.fxRate !== null ? position.fxRate.toFixed(4) : 'Missing FX'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
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
