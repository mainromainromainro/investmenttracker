# Implementation Notes

Mise à jour: 2026-03-30

## Objectif réel du dépôt

Le dépôt sert à consolider des portefeuilles d'investissement importés depuis des CSV, avec un niveau de confiance suffisant pour:

- afficher des holdings exacts
- valoriser en EUR
- suivre un coût de revient partiel
- remonter les trous de données

Le projet n'est plus structuré comme un CRUD de démonstration. Le flux critique passe par l'import, la résolution d'identité et les calculs.

## Architecture logique

### UI active

- [src/features/dashboard/Dashboard.tsx](src/features/dashboard/Dashboard.tsx)
- [src/features/settings/Settings.tsx](src/features/settings/Settings.tsx)
- [src/features/import/CsvImportSection.tsx](src/features/import/CsvImportSection.tsx)

### Persistance

- [src/db/index.ts](src/db/index.ts) définit le schéma Dexie et les migrations jusqu'à `version(6)`

### Repositories critiques

- [src/repositories/adminRepository.ts](src/repositories/adminRepository.ts)
  - reset / seed
  - import de transactions normalisées
  - import de snapshots mensuels
  - audit trail d'import
  - création conditionnelle de plateformes, comptes, actifs, prix, snapshots
- repositories CRUD simples
  - `assetRepository`
  - `platformRepository`
  - `accountRepository`
  - `transactionRepository`
  - `priceRepository`
  - `fxRepository`
  - `importJobRepository`
  - `importRowRepository`

### Bibliothèques métier

- [src/lib/csvImport.ts](src/lib/csvImport.ts)
  - mapping de colonnes
  - parsing de transactions et de snapshots
  - alias de colonnes
  - transport des métadonnées d'import
- [src/lib/csvSourceProfiles.ts](src/lib/csvSourceProfiles.ts)
  - détection de sources connues
  - extraction de la section `Open Position Summary` pour IBKR
- [src/lib/assetIdentity.ts](src/lib/assetIdentity.ts)
  - normalisation `ISIN`, ticker courtier, exchange et devise
  - construction de la clé canonique
- [src/lib/assetResolver.ts](src/lib/assetResolver.ts)
  - match par ISIN
  - match par clé canonique
  - promotion des actifs legacy
  - signalement des cas ambigus / non résolus
- [src/lib/holdings.ts](src/lib/holdings.ts)
  - calcul canonique des quantités
  - exclusion des transactions snapshot quand une source transactionnelle explicite existe pour le même scope
- [src/lib/computations.ts](src/lib/computations.ts)
  - moteur branché sur le dashboard
  - valorisation, PnL latent, coût de revient, dividendes, agrégations, historique
- [src/lib/portfolioAnalytics.ts](src/lib/portfolioAnalytics.ts)
  - moteur analytique plus ambitieux
  - pas encore utilisé par l'UI principale

## Invariants métier à préserver

### Imports

- un même fichier ne doit pas créer deux imports réels si son `fileFingerprint` a déjà été importé
- une même ligne canonique ne doit pas générer de doublon même si elle revient via un autre import
- toute ligne rejetée, ambiguë ou dédupliquée doit rester auditable

### Identité d'actif

- ne pas fusionner deux instruments distincts uniquement parce qu'ils partagent un symbole visible
- préférer `ISIN` quand il est disponible
- sinon s'appuyer sur la combinaison `brokerSymbol + exchange + currency`
- les actifs legacy ne doivent être promus que de manière explicable

### Holdings

- `BUY`, `TRANSFER_IN`, `STAKING_REWARD`, `AIRDROP` augmentent la quantité
- `SELL`, `TRANSFER_OUT` diminuent la quantité
- `DIVIDEND`, `DEPOSIT`, `WITHDRAW`, `FEE` n'affectent pas la quantité de holding
- un snapshot mensuel ne doit pas s'ajouter naïvement à un ledger transactionnel existant

### Valorisation

- la devise de valorisation suit le `PriceSnapshot` le plus récent
- le FX est recherché sur la paire `<currency>/EUR`
- si le prix ou le FX manque, la valeur reste partielle et la data quality doit le refléter

## État de l'UI

### Ce qui est actif

- import CSV avec aperçu et confirmation
- refresh live des prix et du FX depuis le dashboard
- seed et reset local

### Ce qui existe mais n'est pas exposé

- écrans CRUD détaillés pour assets, plateformes, transactions, comptes, prix, FX
- stores et repositories complets correspondants

Cette distinction est importante: modifier un module "présent dans le repo" ne veut pas dire modifier une surface réellement utilisée.

## Dette et zones à surveiller

### 1. Deux moteurs analytiques coexistent

- `computePortfolioSummary()` est celui utilisé par l'UI
- `analyzePortfolio()` est plus riche mais non branché

Avant de migrer vers le second, il faut définir:

- la source de vérité cible
- le plan de migration
- les écarts de sémantique voulus

### 2. Compte et plateforme

Le modèle de données supporte bien `Account`, mais le dashboard principal n'expose pas encore une vraie lecture par compte avec libellés complets. Le modèle existe, l'UX dédiée reste à construire ou à reconnecter.

### 3. Résolution manuelle des ambiguïtés

Les cas `AMBIGUOUS` ou `UNRESOLVED` sont portés dans les types et l'audit, mais il manque encore une vraie UI de revue manuelle.

### 4. Données live

Le refresh Twelve Data dépend:

- de la couverture du provider
- de la clé fournie
- de la qualité des symboles utilisés pour l'appel

Il ne faut pas considérer ce flux live comme une source de vérité comptable.

## Tests actuellement pertinents

Le projet a des tests sur:

- `assetResolver`
- `csvImport`
- `csvSourceProfiles`
- `holdings`
- `computations`
- `portfolioAnalytics`
- `positionSnapshots`
- `liveMarketData`
- `dashboardAnalytics`
- `importUx`

Quand un changement touche l'import ou les holdings, les zones minimales à revalider sont:

```bash
npm run test -- --run
```

Et avant d'annoncer un état stable:

```bash
npm run lint
npm run build
```

## Priorités techniques recommandées

1. Clarifier la cible entre `computations.ts` et `portfolioAnalytics.ts`.
2. Ajouter une UX de revue pour les actifs ambigus/non résolus.
3. Exposer l'historique d'import persistant (`importJobs`, `importRows`) dans l'UI.
4. Rebrancher ou supprimer explicitement les écrans CRUD hérités pour éviter l'ambiguïté produit.
