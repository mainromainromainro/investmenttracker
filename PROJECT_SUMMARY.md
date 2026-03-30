# Project Summary

Mise à jour: 2026-03-30

## TL;DR

Le dépôt contient un tracker de portefeuille offline-first dont la surface utilisateur actuelle est volontairement resserrée autour de deux écrans:

- `Dashboard` pour la lecture et le refresh live
- `Réglages` pour l'import CSV, la configuration Twelve Data, le seed et le reset local

Le cœur métier n'est pas le CRUD historique mais le pipeline d'import:

- parsing de CSV hétérogènes
- détection de source
- normalisation
- résolution d'actifs
- déduplication
- persistance auditable
- calcul de holdings et de valorisation

## Ce qui est vrai aujourd'hui

### Runtime exposé

- routes actives: `/`, `/settings`
- anciennes routes CRUD conservées mais redirigées
- import intégré à `Settings`, plus de page d'import dédiée

### Persistance

- Dexie `InvestmentTrackerDB`
- version de schéma courante: `6`
- 9 tables: `platforms`, `accounts`, `assets`, `transactions`, `priceSnapshots`, `fxSnapshots`, `importJobs`, `importRows`, `positionSnapshots`

### Couches métier importantes

- [src/lib/csvImport.ts](src/lib/csvImport.ts): parsing normalisé flexible
- [src/features/import/importUx.ts](src/features/import/importUx.ts): détection, aperçu, stats et empreintes
- [src/repositories/adminRepository.ts](src/repositories/adminRepository.ts): import transactionnel et logique de persistance
- [src/lib/assetIdentity.ts](src/lib/assetIdentity.ts): normalisation et clés canoniques
- [src/lib/assetResolver.ts](src/lib/assetResolver.ts): résolution d'actifs importés
- [src/lib/holdings.ts](src/lib/holdings.ts): quantités canoniques
- [src/lib/computations.ts](src/lib/computations.ts): synthèse active utilisée par le dashboard
- [src/lib/portfolioAnalytics.ts](src/lib/portfolioAnalytics.ts): moteur analytique plus riche, testé mais pas encore branché au runtime principal

## Travail en cours dans le workspace

Le chantier visible dans le worktree au moment de cette mise à jour porte sur:

- le renforcement de l'identité d'actif (`ISIN`, `brokerSymbol`, `exchange`, `currency`)
- la résolution d'actifs à l'import
- l'alignement des holdings et de la valorisation avec cette identité canonique
- l'extension des tests autour de `assetResolver`, `csvImport`, `holdings`, `portfolioAnalytics`

En pratique, tout changement dans l'import ou les holdings doit être évalué contre ces fichiers avant d'être intégré.

## Ce qui reste hérité ou partiellement branché

- plusieurs écrans CRUD existent toujours dans `src/features/assets`, `platforms`, `transactions`, `prices`, `fx`, `accounts`
- `accountStore`, `importJobStore` et les repositories associés existent, mais l'UI principale ne les expose pas encore comme écrans autonomes
- `portfolioAnalytics.ts` n'est pas encore la source de vérité du dashboard

## Principaux risques techniques

- divergence entre `computePortfolioSummary` et `analyzePortfolio`
- régression sur l'idempotence des imports
- fusion abusive d'actifs lors d'un match trop permissif
- confusion entre snapshots mensuels et transactions explicites
- documentation qui redevient obsolète si elle réintroduit des états "100% complet" trop figés

## Recommandation pour une reprise par agent

1. Lire [README.md](README.md), puis [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md).
2. Vérifier les fichiers modifiés dans `src/lib`, `src/repositories/adminRepository.ts`, `src/types/index.ts`.
3. Exécuter `npm run test -- --run` avant toute évolution sur le pipeline d'import.
4. Considérer `Dashboard + Settings + import pipeline` comme la surface produit prioritaire.
