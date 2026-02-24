import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import Dashboard from './features/dashboard/Dashboard';
import AssetsList from './features/assets/AssetsList';
import PlatformsList from './features/platforms/PlatformsList';
import TransactionsList from './features/transactions/TransactionsList';
import PricesList from './features/prices/PricesList';
import FxList from './features/fx/FxList';
import Settings from './features/settings/Settings';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-gray-900">
                  Investment Tracker
                </h1>
              </div>
              <div className="flex items-center space-x-4">
                <Link to="/" className="text-gray-600 hover:text-gray-900">
                  Dashboard
                </Link>
                <Link to="/assets" className="text-gray-600 hover:text-gray-900">
                  Assets
                </Link>
                <Link to="/platforms" className="text-gray-600 hover:text-gray-900">
                  Platforms
                </Link>
                <Link to="/transactions" className="text-gray-600 hover:text-gray-900">
                  Transactions
                </Link>
                <Link to="/prices" className="text-gray-600 hover:text-gray-900">
                  Prices
                </Link>
                <Link to="/fx" className="text-gray-600 hover:text-gray-900">
                  FX
                </Link>
                <Link to="/settings" className="text-gray-600 hover:text-gray-900">
                  Settings
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/assets" element={<AssetsList />} />
            <Route path="/platforms" element={<PlatformsList />} />
            <Route path="/transactions" element={<TransactionsList />} />
            <Route path="/prices" element={<PricesList />} />
            <Route path="/fx" element={<FxList />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
