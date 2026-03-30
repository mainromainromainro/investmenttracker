# CSV Import + Holdings Plan

Mise à jour: 2026-03-30

## Objectif

Rendre l'import CSV et le calcul de holdings suffisamment fiables pour servir de base au portefeuille, à la valorisation et aux analytics.

## État actuel

### Déjà en place

- détection de sources connues:
  - Trading 212
  - Revolut Stock
  - Interactive Brokers `Open Position Summary`
- double mode d'import:
  - `transactions`
  - `monthly_positions`
- audit trail avec `ImportJob` et `ImportRow`
- déduplication par fichier et par empreinte canonique
- scope par plateforme et compte
- moteur de holdings canonique dans [src/lib/holdings.ts](src/lib/holdings.ts)
- import de snapshots mensuels avec remplacement ciblé et transactions synthétiques
- tests dédiés sur import, holdings, snapshots et analytics

### En cours de durcissement

- identité canonique des actifs
- résolution d'actifs à l'import
- promotion contrôlée des actifs legacy
- couverture de tests autour des cas ambigus/non résolus

## Décision mise à jour

L'ancien cadrage "V1 identity key: ticker" n'est plus suffisant pour l'état actuel du produit.

La stratégie à retenir désormais est:

1. `ISIN` si disponible
2. sinon clé canonique dérivée de `brokerSymbol + exchange + currency`
3. sinon repli legacy explicite et auditable

Autrement dit: le ticker seul n'est plus une source d'identité assez sûre.

## Chantiers restants

### Priorité haute

- UI de revue pour les actifs `AMBIGUOUS` et `UNRESOLVED`
- exposition de l'historique d'import persistant dans l'interface
- clarification de la cible entre `computePortfolioSummary` et `portfolioAnalytics`

### Priorité moyenne

- mémoire de mapping plus visible pour les CSV custom
- parcours d'import plus guidé pour les erreurs bloquantes
- vue par compte réellement exposée dans le dashboard

### Plus tard

- enrichissement métadonnées actifs
- analytics de performance multi-périodes
- outils de réconciliation manuelle

## Critères de confiance à maintenir

- importer deux fois le même fichier ne double pas les positions
- un snapshot mensuel ne casse pas un ledger transactionnel existant sur le même scope
- un import multi-tickers ne s'effondre pas en un seul actif
- une ambiguïté d'actif n'est jamais résolue silencieusement
- toute ligne rejetée ou dédupliquée reste retraçable
