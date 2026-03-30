# File Guide

Mise à jour: 2026-03-30

Ce fichier sert de plan de navigation rapide pour un agent ou un développeur qui reprend le dépôt.

## Entrées principales

- [package.json](package.json) -> scripts et dépendances
- [src/App.tsx](src/App.tsx) -> routes réellement actives
- [src/features/dashboard/Dashboard.tsx](src/features/dashboard/Dashboard.tsx) -> surface de lecture principale
- [src/features/settings/Settings.tsx](src/features/settings/Settings.tsx) -> surface d'administration et d'import

## Import et identité d'actif

- [src/features/import/CsvImportSection.tsx](src/features/import/CsvImportSection.tsx)
- [src/features/import/importUx.ts](src/features/import/importUx.ts)
- [src/lib/csvImport.ts](src/lib/csvImport.ts)
- [src/lib/csvSourceProfiles.ts](src/lib/csvSourceProfiles.ts)
- [src/lib/assetIdentity.ts](src/lib/assetIdentity.ts)
- [src/lib/assetResolver.ts](src/lib/assetResolver.ts)
- [src/lib/positionSnapshots.ts](src/lib/positionSnapshots.ts)
- [src/repositories/adminRepository.ts](src/repositories/adminRepository.ts)

## Calculs et analytics

- [src/lib/holdings.ts](src/lib/holdings.ts) -> quantités canoniques
- [src/lib/computations.ts](src/lib/computations.ts) -> synthèse branchée au dashboard
- [src/lib/portfolioAnalytics.ts](src/lib/portfolioAnalytics.ts) -> moteur analytique plus riche, non branché
- [src/features/dashboard/dashboardAnalytics.ts](src/features/dashboard/dashboardAnalytics.ts) -> helpers de tri et de présentation

## Persistance

- [src/db/index.ts](src/db/index.ts) -> schéma Dexie et migrations
- [src/types/index.ts](src/types/index.ts) -> modèle de données complet
- [src/repositories](src/repositories) -> accès aux tables IndexedDB
- [src/stores](src/stores) -> stores Zustand

## Données live

- [src/lib/liveMarketData.ts](src/lib/liveMarketData.ts)
- [src/lib/liveDataConfig.ts](src/lib/liveDataConfig.ts)

## Modules hérités non exposés dans le routeur principal

- [src/features/assets/AssetsList.tsx](src/features/assets/AssetsList.tsx)
- [src/features/platforms/PlatformsList.tsx](src/features/platforms/PlatformsList.tsx)
- [src/features/accounts/AccountsList.tsx](src/features/accounts/AccountsList.tsx)
- [src/features/transactions/TransactionsList.tsx](src/features/transactions/TransactionsList.tsx)
- [src/features/prices/PricesList.tsx](src/features/prices/PricesList.tsx)
- [src/features/fx/FxList.tsx](src/features/fx/FxList.tsx)

Ils restent utiles pour comprendre le modèle et peuvent être réactivés plus tard, mais ils ne décrivent pas la surface produit actuelle.

## Tests utiles par zone

- import:
  - [src/lib/csvImport.test.ts](src/lib/csvImport.test.ts)
  - [src/lib/csvSourceProfiles.test.ts](src/lib/csvSourceProfiles.test.ts)
  - [src/features/import/importUx.test.ts](src/features/import/importUx.test.ts)
- identité d'actif:
  - [src/lib/assetResolver.test.ts](src/lib/assetResolver.test.ts)
- holdings / valorisation:
  - [src/lib/holdings.test.ts](src/lib/holdings.test.ts)
  - [src/lib/computations.test.ts](src/lib/computations.test.ts)
  - [src/lib/portfolioAnalytics.test.ts](src/lib/portfolioAnalytics.test.ts)
  - [src/lib/positionSnapshots.test.ts](src/lib/positionSnapshots.test.ts)
- live:
  - [src/lib/liveMarketData.test.ts](src/lib/liveMarketData.test.ts)

## Documentation à garder alignée

- [README.md](README.md)
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [CSV_HOLDINGS_ROLLOUT_PLAN.md](CSV_HOLDINGS_ROLLOUT_PLAN.md)
- [CENTRAL_GOVERNANCE.md](CENTRAL_GOVERNANCE.md)
- [FINARY_BOURSE_CRYPTO_ALIGNMENT.md](FINARY_BOURSE_CRYPTO_ALIGNMENT.md)
