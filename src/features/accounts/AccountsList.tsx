import React, { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { useAccountStore } from '../../stores/accountStore';
import { usePlatformStore } from '../../stores/platformStore';
import { AccountType } from '../../types';

const ACCOUNT_TYPES: AccountType[] = ['BROKERAGE', 'RETIREMENT', 'EXCHANGE', 'WALLET', 'OTHER'];

const AccountsList: React.FC = () => {
  const accounts = useAccountStore((s) => s.accounts);
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts);
  const addAccount = useAccountStore((s) => s.addAccount);
  const deleteAccount = useAccountStore((s) => s.deleteAccount);

  const platforms = usePlatformStore((s) => s.platforms);
  const fetchPlatforms = usePlatformStore((s) => s.fetchPlatforms);

  const [form, setForm] = useState({
    platformId: '',
    name: '',
    type: 'BROKERAGE' as AccountType,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAccounts = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchAccounts(), fetchPlatforms()]);
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load accounts.';
        setError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadAccounts();

    return () => {
      isMounted = false;
    };
  }, [fetchAccounts, fetchPlatforms]);

  const groupedPlatforms = useMemo(
    () => new Map(platforms.map((platform) => [platform.id, platform])),
    [platforms],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.platformId || !form.name.trim()) return;

    await addAccount({
      id: `account_${Date.now()}`,
      platformId: form.platformId,
      name: form.name.trim(),
      type: form.type,
    });

    setForm({
      platformId: form.platformId,
      name: '',
      type: form.type,
    });
  };

  if (loading) {
    return <div className="py-6 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Accounts"
        subtitle="Model broker, exchange and wallet sub-accounts under each institution."
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm text-gray-700">
            <span className="font-medium">Platform</span>
            <select
              value={form.platformId}
              onChange={(event) => setForm((current) => ({ ...current, platformId: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
            >
              <option value="">Select a platform</option>
              {platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-gray-700">
            <span className="font-medium">Account name</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="PEA, CTO, Binance Spot..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
            />
          </label>

          <label className="space-y-1 text-sm text-gray-700">
            <span className="font-medium">Type</span>
            <select
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({ ...current, type: event.target.value as AccountType }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
            >
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="md:col-span-3 rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
          >
            Add Account
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Account</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Platform</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                    No accounts yet. Create one to separate PEA, CTO, exchange and wallet flows.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{account.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {groupedPlatforms.get(account.platformId)?.name ?? 'Unknown platform'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{account.type}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => deleteAccount(account.id)}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
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

export default AccountsList;
