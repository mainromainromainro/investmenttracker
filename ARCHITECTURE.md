# Architecture

Mise à jour: 2026-03-30

## Vue simplifiée

```text
Utilisateur
  -> Dashboard / Settings
    -> Stores Zustand
      -> Repositories
        -> Dexie / IndexedDB

Import CSV
  -> parse + detect + preview
    -> asset resolution + dedupe + audit trail
      -> transactions / positionSnapshots / priceSnapshots / fxSnapshots
        -> computations.ts
          -> Dashboard
```

## Surface runtime

### Pages actives

- [src/features/dashboard/Dashboard.tsx](src/features/dashboard/Dashboard.tsx)
- [src/features/settings/Settings.tsx](src/features/settings/Settings.tsx)

### Module d'import actif

- [src/features/import/CsvImportSection.tsx](src/features/import/CsvImportSection.tsx)

### Routes héritées

Les pages `assets`, `platforms`, `accounts`, `transactions`, `prices`, `fx` existent toujours dans `src/features`, mais [src/App.tsx](src/App.tsx) les redirige vers `/settings`.

## Couches techniques

### 1. UI

- React 18
- React Router
- composants visuels concentrés autour du dashboard et des réglages

Le dashboard est un consommateur de synthèse. Il ne détient pas la logique comptable.

### 2. State management

Les stores Zustand servent surtout au chargement et à la mutation des collections Dexie:

- `platformStore`
- `accountStore`
- `assetStore`
- `transactionStore`
- `priceStore`
- `fxStore`
- `importJobStore`

### 3. Repositories

Les repositories simples font du CRUD direct. Le repository à forte valeur métier est [src/repositories/adminRepository.ts](src/repositories/adminRepository.ts), qui orchestre:

- reset et seed
- import transactionnel
- import de snapshots mensuels
- création conditionnelle des entités manquantes
- audit trail et déduplication

### 4. Base locale

[src/db/index.ts](src/db/index.ts) définit `InvestmentTrackerDB`.

Schéma courant:

- `platforms`
- `accounts`
- `assets`
- `transactions`
- `priceSnapshots`
- `fxSnapshots`
- `importJobs`
- `importRows`
- `positionSnapshots`

Le schéma a évolué en plusieurs versions. Les migrations récentes servent surtout à introduire:

- les comptes
- l'audit trail d'import
- les snapshots mensuels
- l'identité canonique des actifs

## Pipeline d'import

### Transactions

```text
CSV brut
  -> detectImportPreset()
  -> parseNormalizedTransactionsCsv()
  -> preview stats / erreurs
  -> adminRepository.importNormalizedTransactions()
    -> upsert platform/account
    -> resolveImportedAsset()
    -> create transaction(s)
    -> create price snapshot(s) si pertinent
    -> create import job + import rows
```

### Snapshots mensuels

```text
CSV brut ou section IBKR
  -> parseNormalizedPositionSnapshotsCsv()
  -> preview stats / erreurs
  -> adminRepository.importNormalizedPositionSnapshots()
    -> upsert platform/account/asset
    -> replace scoped position snapshots
    -> générer transactions synthétiques si nécessaire
    -> générer snapshots de prix associés
    -> créer import job + import rows
```

## Sources de vérité

### Holdings

Source active:

- [src/lib/holdings.ts](src/lib/holdings.ts)
- [src/lib/computations.ts](src/lib/computations.ts)

Règle importante:

- si des transactions explicites existent pour un couple `asset/platform/account`, les transactions synthétiques issues de snapshots ne doivent pas reprendre la main sur cette même paire

### Valorisation

Source active:

- [src/lib/computations.ts](src/lib/computations.ts)

Inputs:

- holdings calculés
- derniers `PriceSnapshot`
- derniers `FxSnapshot`

### Analytics avancées

Moteur présent mais non branché:

- [src/lib/portfolioAnalytics.ts](src/lib/portfolioAnalytics.ts)

Il couvre déjà:

- coût de revient
- realized/unrealized PnL
- frais
- dividendes
- rewards
- data quality

Mais tant qu'il n'est pas branché dans l'UI, il ne faut pas le considérer comme la source de vérité du produit affiché.

## Résolution d'actifs

La logique d'identité est maintenant un axe architectural, pas un détail de parsing.

Ordre de priorité actuel:

1. match exact par `ISIN`
2. match par clé canonique dérivée
3. match "legacy" contrôlé sur symbole courtier + devise
4. création d'actif ou signalement d'ambiguïté

Fichiers clés:

- [src/lib/assetIdentity.ts](src/lib/assetIdentity.ts)
- [src/lib/assetResolver.ts](src/lib/assetResolver.ts)

## Données live

Le refresh live passe par [src/lib/liveMarketData.ts](src/lib/liveMarketData.ts):

- quotes par symbole
- taux FX vers EUR

Il s'agit d'un enrichissement utilisateur, pas d'un mécanisme de persistance primaire.

## Décisions d'architecture à garder en tête

### Ce qui est volontaire

- IndexedDB reste la source de vérité locale
- l'import est auditable
- les actifs ont une identité plus forte qu'un simple ticker affiché
- les snapshots mensuels sont traités comme une sémantique différente des transactions

### Ce qui n'est pas encore tranché

- migration du dashboard vers `portfolioAnalytics.ts`
- stratégie produit sur les écrans CRUD hérités
- workflow UI de résolution manuelle d'actifs
