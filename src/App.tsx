import { BrowserRouter, Routes, Route, NavLink, Link, Navigate } from 'react-router-dom';
import './App.css';
import Dashboard from './features/dashboard/Dashboard';
import Settings from './features/settings/Settings';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/settings', label: 'Réglages' },
];

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="relative min-h-screen overflow-hidden bg-transparent text-[#f7f2e5]">
        <div className="pointer-events-none absolute -left-24 top-[-120px] h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="pointer-events-none absolute right-[-120px] top-48 h-80 w-80 rounded-full bg-amber-100/60 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-80px] left-1/3 h-72 w-72 rounded-full bg-lime-100/40 blur-3xl" />

        <header className="sticky top-0 z-20 px-4 pb-3 pt-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl glass-nav animate-fade-up">
            <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center justify-between gap-4">
                <Link to="/" className="text-xl font-semibold tracking-tight text-[#173326] sm:text-2xl">
                  Investment Tracker
                </Link>
              </div>
              <nav className="flex flex-wrap items-center gap-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-1.5 text-sm transition ${
                        isActive
                          ? 'bg-emerald-900 text-[#f8f3e9] shadow-sm'
                          : 'text-[#536655] hover:bg-white/40 hover:text-[#173326]'
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
            <Route path="/settings" element={<Settings />} />
            <Route path="/import" element={<Navigate to="/settings" replace />} />
            <Route path="/assets" element={<Navigate to="/settings" replace />} />
            <Route path="/platforms" element={<Navigate to="/settings" replace />} />
            <Route path="/accounts" element={<Navigate to="/settings" replace />} />
            <Route path="/transactions" element={<Navigate to="/settings" replace />} />
            <Route path="/prices" element={<Navigate to="/settings" replace />} />
            <Route path="/fx" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
