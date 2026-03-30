# Investment Tracker

Dernière mise à jour: 2026-03-30

Investment Tracker est un portefeuille d'investissement local-first construit avec `Vite`, `React`, `TypeScript`, `Dexie` et `Zustand`.

Le produit n'est plus un simple CRUD multi-pages. L'usage réel du workspace est aujourd'hui centré sur:

- un `Dashboard` de synthèse
- une page `Réglages` qui concentre l'import CSV, la configuration live Twelve Data et les outils d'administration locale
- un pipeline d'import orienté audit, déduplication et résolution d'actifs

## Vue d'ensemble actuelle

### Surface UI réellement exposée

- `/` -> `Dashboard`
- `/settings` -> `Réglages`
- `/import`, `/assets`, `/platforms`, `/accounts`, `/transactions`, `/prices`, `/fx` -> redirection vers `/settings`

Les anciens écrans CRUD existent encore dans `src/features/*`, mais ils ne sont plus câblés dans le routeur principal. Ils servent surtout de base de travail ou de modules hérités.

### Capacités déjà présentes dans le code

- stockage offline-first dans IndexedDB via Dexie
- consolidation multi-plateformes et multi-comptes
- prise en charge de `ETF`, `STOCK`, `CRYPTO`
- transactions enrichies: `BUY`, `SELL`, `DEPOSIT`, `WITHDRAW`, `FEE`, `DIVIDEND`, `TRANSFER_IN`, `TRANSFER_OUT`, `STAKING_REWARD`, `AIRDROP`
- import CSV en deux modes:
  - `transactions`
  - `monthly_positions`
- audit trail d'import avec `ImportJob` et `ImportRow`
- déduplication par empreinte de fichier et empreintes canoniques de lignes
- résolution d'actifs via ISIN puis clé canonique `brokerSymbol + exchange + currency`, avec repli contrôlé sur les actifs legacy
- snapshots de prix et de FX
- rafraîchissement live via Twelve Data pour les prix et les taux de change
- calculs de valorisation, PRU/coût de revient partiel, PnL latent, revenus de dividendes et historique de valorisation

## Modèle de données actuel

Le schéma Dexie courant est en version `6` et persiste 9 tables:

- `platforms`
- `accounts`
- `assets`
- `transactions`
- `priceSnapshots`
- `fxSnapshots`
- `importJobs`
- `importRows`
- `positionSnapshots`

Les types sont centralisés dans [src/types/index.ts](src/types/index.ts).

### Points importants du modèle

- `Asset` embarque désormais une identité métier:
  - `canonicalAssetKey`
  - `identityStrategy`
  - `identityStatus`
  - `isin`
  - `brokerSymbol`
  - `exchange`
- `Transaction`, `PriceSnapshot` et `PositionSnapshot` héritent d'un contexte de source d'import pour conserver la traçabilité
- `ImportJob` et `ImportRow` servent à l'idempotence, au debug et au support utilisateur

## Pipeline métier

### 1. Import CSV

Le flux principal passe par [src/features/import/CsvImportSection.tsx](src/features/import/CsvImportSection.tsx):

1. chargement du fichier
2. détection éventuelle de la source
3. parsing en lignes normalisées
4. affichage d'un aperçu avec stats, erreurs et qualité de mapping
5. préchargement optionnel des devises vers EUR
6. import dans IndexedDB via `adminRepository`

### 2. Résolution d'actifs

Le point clé du chantier actuel est [src/lib/assetResolver.ts](src/lib/assetResolver.ts):

- priorité au match par ISIN
- sinon match par clé canonique dérivée de `brokerSymbol`, `exchange` et `currency`
- si un actif legacy correspond seulement de manière lâche, il peut être promu vers une identité plus forte
- les cas ambigus ou non résolus restent explicites

### 3. Holdings et valorisation

La synthèse active du dashboard s'appuie aujourd'hui sur [src/lib/computations.ts](src/lib/computations.ts), qui:

- filtre les transactions faisant autorité pour les holdings
- calcule les quantités par `assetId + platformId + accountId`
- valorise en EUR via les derniers snapshots de prix et FX
- agrège par plateforme, type et ticker
- calcule un historique temporel de valorisation

Un moteur plus ambitieux existe dans [src/lib/portfolioAnalytics.ts](src/lib/portfolioAnalytics.ts), mais il n'est pas encore branché sur le dashboard. Il faut donc éviter de faire diverger ces deux couches sans décision explicite.

## Sources d'import et données live

### Sources reconnues explicitement

- `Trading 212`
- `Revolut Stock`
- `Interactive Brokers / Open Position Summary`

Le parsing flexible reste disponible pour les CSV custom via [src/lib/csvImport.ts](src/lib/csvImport.ts).

### Données live

[src/lib/liveMarketData.ts](src/lib/liveMarketData.ts) utilise l'API Twelve Data pour:

- les prix live par ticker
- les taux de change vers EUR

La clé peut venir:

- de `localStorage`
- de `VITE_TWELVE_DATA_API_KEY`
- sinon d'une clé de démonstration (`demo`) très limitée

## Commandes utiles

```bash
npm install
npm run dev
npm run test -- --run
npm run lint
npm run build
```

## Ce qu'un agent doit savoir avant d'intervenir

### Invariants à préserver

- ne pas casser l'idempotence des imports
- ne pas remélanger implicitement snapshot mensuel et transaction explicite
- ne pas fusionner silencieusement des actifs ambigus
- ne pas introduire une troisième source de vérité pour les holdings ou la valorisation

### Réalité du workspace au 2026-03-30

- le chantier actif porte sur le durcissement de l'identité d'actif et de la résolution d'import
- plusieurs fichiers de tests ont évolué dans `src/lib/*`
- la documentation historique qui parlait d'un projet "complet" en 5 tables n'est plus valable

## Documentation associée

- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) -> état courant et handoff rapide
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) -> détails techniques et limites
- [ARCHITECTURE.md](ARCHITECTURE.md) -> architecture du runtime et flux de données
- [QUICKSTART.md](QUICKSTART.md) -> démarrage local et parcours recommandé
- [FILES.md](FILES.md) -> repérage rapide des fichiers importants
- [CSV_HOLDINGS_ROLLOUT_PLAN.md](CSV_HOLDINGS_ROLLOUT_PLAN.md) -> feuille de route import/holdings
- [CENTRAL_GOVERNANCE.md](CENTRAL_GOVERNANCE.md) -> règles d'évolution sur le pipeline critique
