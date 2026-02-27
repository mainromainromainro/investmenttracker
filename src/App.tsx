import { BrowserRouter, Routes, Route, NavLink, Link } from 'react-router-dom';
import './App.css';
import Dashboard from './features/dashboard/Dashboard';
import AssetsList from './features/assets/AssetsList';
import PlatformsList from './features/platforms/PlatformsList';
import TransactionsList from './features/transactions/TransactionsList';
import PricesList from './features/prices/PricesList';
import FxList from './features/fx/FxList';
import Settings from './features/settings/Settings';
import ImportPage from './features/import/ImportPage';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/assets', label: 'Assets' },
  { to: '/platforms', label: 'Platforms' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/prices', label: 'Prices' },
  { to: '/fx', label: 'FX' },
  { to: '/settings', label: 'Settings' },
];

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
        <div className="pointer-events-none absolute -left-24 top-[-120px] h-72 w-72 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="pointer-events-none absolute right-[-120px] top-48 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-80px] left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl" />

        <header className="sticky top-0 z-20 px-4 pb-3 pt-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl glass-nav animate-fade-up">
            <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center justify-between gap-4">
                <Link to="/" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  Investment Tracker
                </Link>
                <NavLink
                  to="/import"
                  className="inline-flex items-center rounded-lg bg-cyan-400/90 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Import CSV
                </NavLink>
              </div>
              <nav className="flex flex-wrap items-center gap-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-1.5 text-sm transition ${
                        isActive
                          ? 'bg-white/20 text-white shadow-sm'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`
                    }
                    end={item.to === '/'}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <main className="relative z-10 mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/assets" element={<AssetsList />} />
            <Route path="/platforms" element={<PlatformsList />} />
            <Route path="/transactions" element={<TransactionsList />} />
            <Route path="/prices" element={<PricesList />} />
            <Route path="/fx" element={<FxList />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
