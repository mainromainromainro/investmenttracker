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
      <div className="relative min-h-screen overflow-hidden bg-emerald-950 text-stone-100">
        <div className="pointer-events-none absolute -left-24 top-[-120px] h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="pointer-events-none absolute right-[-120px] top-48 h-80 w-80 rounded-full bg-lime-300/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-80px] left-1/3 h-72 w-72 rounded-full bg-teal-300/10 blur-3xl" />

        <header className="sticky top-0 z-20 px-4 pb-3 pt-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl glass-nav animate-fade-up">
            <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center justify-between gap-4">
                <Link to="/" className="text-xl font-semibold tracking-tight text-stone-100 sm:text-2xl">
                  Investment Tracker
                </Link>
                <NavLink
                  to="/import"
                  className="inline-flex items-center rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-semibold text-emerald-950 transition hover:bg-stone-200"
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
                          ? 'bg-stone-100/20 text-stone-50 shadow-sm'
                          : 'text-stone-300 hover:bg-stone-100/10 hover:text-stone-100'
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
