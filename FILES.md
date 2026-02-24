# Files Structure & Paths

## Configuration Files
- [package.json](/Users/romain/Investment%20Tracker/package.json)
- [vite.config.ts](/Users/romain/Investment%20Tracker/vite.config.ts)
- [tsconfig.json](/Users/romain/Investment%20Tracker/tsconfig.json)
- [tsconfig.node.json](/Users/romain/Investment%20Tracker/tsconfig.node.json)
- [vitest.config.ts](/Users/romain/Investment%20Tracker/vitest.config.ts)
- [tailwind.config.js](/Users/romain/Investment%20Tracker/tailwind.config.js)
- [postcss.config.js](/Users/romain/Investment%20Tracker/postcss.config.js)
- [eslint.config.js](/Users/romain/Investment%20Tracker/eslint.config.js)
- [index.html](/Users/romain/Investment%20Tracker/index.html)
- [.gitignore](/Users/romain/Investment%20Tracker/.gitignore)

## Documentation
- [README.md](/Users/romain/Investment%20Tracker/README.md) - Main documentation
- [IMPLEMENTATION_NOTES.md](/Users/romain/Investment%20Tracker/IMPLEMENTATION_NOTES.md) - Architecture & TODOs
- [PROJECT_SUMMARY.md](/Users/romain/Investment%20Tracker/PROJECT_SUMMARY.md) - Deliverables summary
- [FILES.md](/Users/romain/Investment%20Tracker/FILES.md) - This file

## Source Code

### Types & Database
- [src/types/index.ts](/Users/romain/Investment%20Tracker/src/types/index.ts) - All TypeScript types
- [src/db/index.ts](/Users/romain/Investment%20Tracker/src/db/index.ts) - Dexie database setup

### Repositories (Data Access Layer)
- [src/repositories/index.ts](/Users/romain/Investment%20Tracker/src/repositories/index.ts) - Exports
- [src/repositories/platformRepository.ts](/Users/romain/Investment%20Tracker/src/repositories/platformRepository.ts) - Platform CRUD
- [src/repositories/assetRepository.ts](/Users/romain/Investment%20Tracker/src/repositories/assetRepository.ts) - Asset CRUD
- [src/repositories/transactionRepository.ts](/Users/romain/Investment%20Tracker/src/repositories/transactionRepository.ts) - Transaction CRUD
- [src/repositories/priceRepository.ts](/Users/romain/Investment%20Tracker/src/repositories/priceRepository.ts) - Price snapshot CRUD
- [src/repositories/fxRepository.ts](/Users/romain/Investment%20Tracker/src/repositories/fxRepository.ts) - FX snapshot CRUD

### Stores (State Management)
- [src/stores/platformStore.ts](/Users/romain/Investment%20Tracker/src/stores/platformStore.ts) - Zustand store
- [src/stores/assetStore.ts](/Users/romain/Investment%20Tracker/src/stores/assetStore.ts) - Zustand store
- [src/stores/transactionStore.ts](/Users/romain/Investment%20Tracker/src/stores/transactionStore.ts) - Zustand store
- [src/stores/priceStore.ts](/Users/romain/Investment%20Tracker/src/stores/priceStore.ts) - Zustand store
- [src/stores/fxStore.ts](/Users/romain/Investment%20Tracker/src/stores/fxStore.ts) - Zustand store

### Core Library
- [src/lib/computations.ts](/Users/romain/Investment%20Tracker/src/lib/computations.ts) - Portfolio calculations
- [src/lib/computations.test.ts](/Users/romain/Investment%20Tracker/src/lib/computations.test.ts) - Vitest tests

### Components
- [src/components/PageHeading.tsx](/Users/romain/Investment%20Tracker/src/components/PageHeading.tsx) - Reusable component

### Features (Pages)
- [src/features/dashboard/Dashboard.tsx](/Users/romain/Investment%20Tracker/src/features/dashboard/Dashboard.tsx) - Portfolio dashboard
- [src/features/platforms/PlatformsList.tsx](/Users/romain/Investment%20Tracker/src/features/platforms/PlatformsList.tsx) - Platform CRUD
- [src/features/assets/AssetsList.tsx](/Users/romain/Investment%20Tracker/src/features/assets/AssetsList.tsx) - Asset CRUD
- [src/features/transactions/TransactionsList.tsx](/Users/romain/Investment%20Tracker/src/features/transactions/TransactionsList.tsx) - Transaction CRUD
- [src/features/prices/PricesList.tsx](/Users/romain/Investment%20Tracker/src/features/prices/PricesList.tsx) - Price snapshot CRUD
- [src/features/fx/FxList.tsx](/Users/romain/Investment%20Tracker/src/features/fx/FxList.tsx) - FX snapshot CRUD
- [src/features/settings/Settings.tsx](/Users/romain/Investment%20Tracker/src/features/settings/Settings.tsx) - Settings (reset, seed)

### Root App Files
- [src/App.tsx](/Users/romain/Investment%20Tracker/src/App.tsx) - Main app with routing
- [src/App.css](/Users/romain/Investment%20Tracker/src/App.css) - App styles
- [src/main.tsx](/Users/romain/Investment%20Tracker/src/main.tsx) - React entry point
- [src/index.css](/Users/romain/Investment%20Tracker/src/index.css) - Tailwind + base styles

## Summary

**Total: 41 files**
- 6 Configuration files
- 4 Documentation files
- 1 Database file
- 5 Repository files
- 5 Store files
- 2 Library files (computation + tests)
- 1 Component file
- 7 Feature pages
- 1 Main app file
- 3 CSS/styling files
- 1 HTML file
- 1 .gitignore file

**Total Lines of Code**: ~1,900 lines (TypeScript + React)
**Test Coverage**: 4 core functions with 19 assertions
