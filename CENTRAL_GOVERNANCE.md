# Central Governance

Mise à jour: 2026-03-30

Ce document décrit les garde-fous à respecter quand on modifie le pipeline critique `import -> holdings -> valorisation`.

## Décisions verrouillées

- l'import doit rester auditable et idempotent
- les snapshots mensuels et les transactions explicites sont deux sémantiques différentes
- l'identité d'actif ne doit pas être ramenée à un simple ticker visible
- un cas ambigu doit rester visible, pas être "deviné"
- le dashboard actuel repose sur `computePortfolioSummary()` tant qu'une migration explicite n'a pas été décidée

## Checklist de revue

### Ingestion

- les sources connues restent détectées de manière déterministe
- les erreurs et sections non supportées restent explicites
- le preview continue d'afficher assez de contexte pour comprendre ce qui sera importé

### Modèle et persistance

- toute migration Dexie reste compatible avec le stock local existant
- `ImportJob` et `ImportRow` conservent la traçabilité utile au support
- la déduplication ne dépend pas d'un détail UI mutable

### Identité d'actif

- priorité au match par `ISIN`
- la clé canonique reste stable pour un même instrument
- aucun élargissement de match ne doit fusionner des actifs distincts sans test dédié

### Holdings et valorisation

- les quantités restent calculées depuis la couche canonique
- les transactions snapshot ne reprennent pas la main sur un ledger explicite existant
- les trous de prix, FX ou coût de revient restent visibles dans la data quality

### UI

- la surface active reste claire
- ne pas présenter un écran hérité comme "produit courant" s'il n'est pas routé
- toute promesse utilisateur nouvelle doit être confirmée par le code réellement branché

## Gaps à signaler avant intégration

### Deux moteurs analytiques

Le dépôt contient `computePortfolioSummary()` et `analyzePortfolio()`.

Si une PR modifie l'un sans traiter l'autre, le reviewer doit vérifier:

- si c'est volontaire
- si la doc l'explique
- si le dashboard reste cohérent

### Résolution d'actif trop permissive

Un match par symbole seul est insuffisant sur les instruments listés multi-places ou multi-devises.

### Confusion snapshot / ledger

Traiter un relevé mensuel comme un journal d'opérations crée des doubles comptages et des PnL faux.

### Documentation trompeuse

Les docs qui annoncent un état "complet" ou une liste de pages non routées doivent être corrigées dans la même PR.
