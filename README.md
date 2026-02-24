# Investment Tracker

A lightweight offline-first investment portfolio tracker built with **Vite + React + TypeScript**, **Dexie (IndexedDB)**, **Zustand**, and **Tailwind CSS**.

## Features

- 📱 **Offline-first**: All data stored locally in IndexedDB
- 🏦 **Multi-platform support**: Track assets across different brokers
- 💰 **Multi-currency**: Automatic currency conversion to EUR
- 📊 **Portfolio dashboard**: KPIs, aggregations by platform and asset type
- 🔄 **Flexible transactions**: BUY, SELL, DEPOSIT, WITHDRAW, FEE support
- 📈 **Price tracking**: Record asset prices at specific dates
- 💱 **FX rates**: Manual FX rate snapshots for conversion
- 🧪 **Tested**: Core computations covered with Vitest
- 🏗️ **Scalable**: Repository layer for easy migration to Supabase

## Tech Stack

- **Frontend**: React 18 + TypeScript + React Router
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Database**: Dexie (IndexedDB wrapper)
- **Build**: Vite
- **Testing**: Vitest
- **Validation**: Zod (ready for integration)

## Project Structure

```
src/
├── components/           # Reusable UI components
├── db/                   # Dexie database setup
├── features/             # Feature modules (folder structure)
│   ├── assets/          # Asset CRUD
│   ├── dashboard/       # Portfolio dashboard
│   ├── fx/              # FX rate management
│   ├── platforms/       # Platform/broker CRUD
│   ├── prices/          # Price snapshot CRUD
│   ├── settings/        # Settings, reset, seed data
│   └── transactions/    # Transaction CRUD
├── lib/                 # Utility functions
│   └── computations.ts  # Portfolio calculations (tested)
├── repositories/        # Data access layer
│   ├── assetRepository.ts
│   ├── fxRepository.ts
│   ├── platformRepository.ts
│   ├── priceRepository.ts
│   └── transactionRepository.ts
├── stores/             # Zustand stores
│   ├── assetStore.ts
│   ├── fxStore.ts
│   ├── platformStore.ts
│   ├── priceStore.ts
│   └── transactionStore.ts
├── types/              # TypeScript types
├── App.tsx
└── main.tsx
```

## Data Model

### Platform
```typescript
{
  id: string,
  name: string,
  createdAt: number
}
```

### Asset
```typescript
{
  id: string,
  type: 'ETF' | 'STOCK' | 'CRYPTO',
  symbol: string,
  name: string,
  currency: string,  // e.g., "USD", "GBP"
  createdAt: number
}
```

### Transaction
```typescript
{
  id: string,
  platformId: string,
  assetId?: string,
  kind: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' | 'FEE',
  date: number,
  qty?: number,
  price?: number,
  fee?: number,
  currency: string,
  note?: string,
  createdAt: number
}
```

### PriceSnapshot
```typescript
{
  id: string,
  assetId: string,
  date: number,
  price: number,
  currency: string,  // Price currency (asset's native currency)
  createdAt: number
}
```

### FxSnapshot
```typescript
{
  id: string,
  pair: string,       // e.g., "USD/EUR"
  date: number,
  rate: number,       // 1 unit of base → EUR (e.g., 1 USD = 0.92 EUR)
  createdAt: number
}
```

## Core Calculations

### Position Quantity
```
qty = sum(BUY transactions) - sum(SELL transactions)
```

### Latest Price
Latest PriceSnapshot by asset (max date)

### Latest FX Rate
Latest FxSnapshot by pair (max date). Defaults to 1 for EUR.

### Value in EUR
```
value_EUR = qty × price × fx_rate
```

### Portfolio Summary
- Total value in EUR
- Aggregated by platform
- Aggregated by asset type
- All positions with quantities and values

## Getting Started

### Prerequisites
- Node.js 16+ (npm or pnpm)

### Installation

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

## Usage

1. **Create platforms** → Go to `/platforms` and add your brokers
2. **Create assets** → Go to `/assets` and add ETFs, stocks, cryptos
3. **Add transactions** → Go to `/transactions` and record buys/sells/deposits
4. **Add prices** → Go to `/prices` and record price snapshots
5. **Add FX rates** → Go to `/fx` and record currency conversion rates
6. **View dashboard** → Go to `/` to see aggregated portfolio value

### Importer des transactions via CSV

Depuis le bouton **Import** de la barre de navigation (ou dans **Settings**), vous pouvez charger un CSV qui sera parsé, enrichi (prix, FX, plateformes/actifs manquants) puis injecté automatiquement. L’import accepte les colonnes canoniques suivantes (ordre libre) ainsi que leurs alias fréquents :

| Colonne attendue | Alias acceptés | Obligatoire | Notes |
| ---------------- | -------------- | ----------- | ----- |
| `date`           |                | Oui         | ISO (`2024-01-01`) ou timestamp (ms) |
| `platform`       | `Broker`       | Oui         | Nom de la plateforme/broker |
| `kind`           | `Type`, `Transaction_Type` | Oui | `BUY`, `SELL`, `DEPOSIT`, `WITHDRAW`, `FEE` |
| `asset_symbol`   | `Ticker`, `Symbol`, `ISIN` | Requis pour BUY/SELL | |
| `asset_name`     | `Name`         | Non         | Défaut : symbole |
| `asset_type`     |                | Requis pour BUY/SELL (défaut : `STOCK`) | Valeurs: `ETF`, `STOCK`, `CRYPTO` |
| `qty`            | `Shares`, `Quantity` | Requis pour BUY/SELL | Doit être > 0 |
| `price`          |                | Requis pour BUY/SELL | |
| `currency`       | `Currency_Code`, `Price_Currency` | Conseillé   | Devise de cotation. Si absente : tentative via ticker puis devise par défaut (sélecteur dans l’UI) |
| `cash_currency`  | `Settlement_Currency` | Non | Devise de règlement (sinon `currency`) |
| `fee`            | `Fees`, `Commission` | Non | Nombre positif |
| `note`           |                | Non | Commentaire libre |

Deux modèles fonctionnent donc :

```
date,platform,currency,kind,asset_symbol,asset_name,asset_type,qty,price,fee,note
```

ou encore

```
Date,Ticker,Type,Shares,Price,Broker,Fees
```

Exemple :

```
2025-01-03,VUSA,BUY,0.048592,108.246,Trading212,0.0
```

Après le chargement du fichier, l’application affiche les erreurs détectées (ligne + message) et le nombre de transactions prêtes à l’import avant d’écrire dans IndexedDB. Pour les devises ≠ EUR, l’import tente automatiquement de récupérer un FX spot via exchangerate.host et de créer les snapshots associés ; sinon un message vous indique les devises à compléter manuellement.

### Testing with Sample Data

1. Go to `/settings`
2. Click **"Add Sample Data"** to populate the database with example data
3. Explore the dashboard and pages
4. Use **"Reset Database"** to clear all data

## Development Notes

### Architecture

The app follows a **layered architecture**:

1. **Components Layer**: React components for UI
2. **Features Layer**: Feature-specific pages and logic
3. **Stores Layer**: Zustand stores for state management
4. **Repositories Layer**: Data access abstraction
5. **Database Layer**: Dexie + IndexedDB

This structure makes it easy to migrate from IndexedDB to a backend like Supabase later.

### Adding New Features

To add a new entity (e.g., `Portfolio`):

1. Add type to `src/types/index.ts`
2. Create `src/repositories/portfolioRepository.ts`
3. Create `src/stores/portfolioStore.ts`
4. Create feature in `src/features/portfolios/`
5. Add route to `src/App.tsx`

### Testing

Core computations are tested in `src/lib/computations.test.ts`:
- `computePositionQty()` - Position quantity calculation
- `getLatestPrice()` - Latest price snapshot retrieval
- `getLatestFxRate()` - Latest FX rate retrieval
- `computeValueEUR()` - EUR value calculation

Run tests:
```bash
npm run test
```

## Known Limitations & TODOs

- [ ] Validation layer using Zod (structure ready, integration pending)
- [ ] Performance tracking (not in scope - value tracking only)
- [ ] Import/export data
- [ ] Multiple portfolios (currently single portfolio)
- [ ] Cost basis tracking for tax purposes
- [ ] Dividend recording
- [ ] Advanced filtering/search on tables
- [ ] Charts/graphs for portfolio evolution
- [ ] Backup to cloud storage

## Performance Notes

For optimal performance:
- IndexedDB is limited to ~50MB per origin (local storage)
- Suitable for tracking up to several thousand transactions
- Computations are O(n) where n = number of transactions
- Consider archiving old data if app grows

## Browser Support

- Modern browsers with IndexedDB support
- Chrome, Firefox, Safari, Edge (latest versions)

## License

MIT

## Contributing

Feel free to fork and submit PRs for improvements!
