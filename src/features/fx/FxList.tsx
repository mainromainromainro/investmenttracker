import React, { useEffect, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { useFxStore } from '../../stores/fxStore';

const FxList: React.FC = () => {
  const fxSnapshots = useFxStore((s) => s.fxSnapshots);
  const fetchFxSnapshots = useFxStore((s) => s.fetchFxSnapshots);
  const addFxSnapshot = useFxStore((s) => s.addFxSnapshot);
  const deleteFxSnapshot = useFxStore((s) => s.deleteFxSnapshot);
  
  const [form, setForm] = useState({
    pair: 'USD/EUR',
    date: new Date().toISOString().split('T')[0],
    rate: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadFx = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchFxSnapshots();
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load FX data.';
        setError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadFx();

    return () => {
      isMounted = false;
    };
  }, [fetchFxSnapshots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rate) return;
    
    await addFxSnapshot({
      id: `fx_${Date.now()}`,
      pair: form.pair,
      date: new Date(form.date).getTime(),
      rate: parseFloat(form.rate),
    });
    setForm({
      pair: 'USD/EUR',
      date: new Date().toISOString().split('T')[0],
      rate: '',
    });
  };

  if (loading) {
    return <div className="text-center py-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="FX Snapshots"
        subtitle="Record FX rates: 1 unit of base currency → EUR"
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Example: "USD/EUR = 0.92" means 1 USD = 0.92 EUR
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pair</label>
              <input
                type="text"
                value={form.pair}
                onChange={(e) => setForm({ ...form, pair: e.target.value.toUpperCase() })}
                placeholder="USD/EUR"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rate</label>
            <input
              type="number"
              step="0.0001"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium"
          >
            Add FX Snapshot
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Pair</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Rate</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {fxSnapshots.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-gray-500">
                    No FX snapshots yet.
                  </td>
                </tr>
              ) : (
                fxSnapshots.map((fx) => (
                  <tr key={fx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{fx.pair}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(fx.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {fx.rate.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteFxSnapshot(fx.id)}
                        className="text-red-600 hover:text-red-700 text-xs font-medium"
                      >
                        Delete
                      </button>
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

export default FxList;
