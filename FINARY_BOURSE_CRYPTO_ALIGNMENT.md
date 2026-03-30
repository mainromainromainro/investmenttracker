# Finary Alignment - Bourse & Crypto

Mise à jour: 2026-03-30

## Rôle de ce document

Ce fichier reste une référence produit. Il ne décrit pas "ce qui est déjà parfait", mais le niveau d'alignement actuel du dépôt avec une expérience à la Finary sur le périmètre bourse + crypto, en mode CSV-first.

## Positionnement actuel

Le projet couvre déjà la base structurelle nécessaire pour un produit d'investissement crédible:

- comptes et plateformes
- import CSV multi-sources
- audit trail d'import
- déduplication
- holdings consolidés
- valorisation EUR
- coût de revient partiel
- dividendes, rewards et frais au niveau du moteur analytique

En revanche, l'UX exposée reste encore plus étroite que le modèle métier. Le produit se comporte aujourd'hui comme:

- un bon moteur local de consolidation et de valorisation
- avec une UI principalement centrée sur le dashboard et l'import

Pas encore comme une expérience Finary complète.

## Ce qui existe déjà

### Fondations produit

- modèle `Account`
- modèle `ImportJob` / `ImportRow`
- taxonomie de transactions plus riche que le MVP historique
- support des snapshots mensuels et des imports transactionnels
- live quotes / FX via Twelve Data
- tests sur import, holdings, analytics et snapshots

### Côté analytics

Le dépôt sait déjà calculer ou préparer:

- market value EUR
- coût de revient
- unrealized PnL
- dividendes
- rewards
- frais
- data quality

Mais tout n'est pas encore visible dans l'UI principale.

## Ce qui est seulement partiel

### Expérience compte par compte

Le modèle et les stores existent, mais l'interface principale n'exploite pas encore pleinement cette granularité.

### Historique d'import

La persistance existe, mais il manque une vraie vue de support/relecture dans l'interface.

### Résolution manuelle d'actifs

Le moteur sait marquer `AMBIGUOUS` ou `UNRESOLVED`, mais l'utilisateur n'a pas encore de workflow complet pour corriger ces cas depuis l'UI.

### Analytics avancées

Le moteur [src/lib/portfolioAnalytics.ts](src/lib/portfolioAnalytics.ts) est plus riche que la synthèse actuellement branchée dans le dashboard.

## Ce qui manque encore pour un vrai niveau "Finary-like"

- expositions secteur / géographie
- métadonnées enrichies par actif
- vue performance par période (`1M`, `YTD`, `1Y`, `ALL`)
- réconciliation manuelle et centre de qualité de données
- calendrier et surfaces dédiées pour le revenu passif
- analytics de frais plus visibles
- connecteurs institutionnels automatiques

## Priorités d'alignement recommandées

1. Exposer l'historique d'import et la qualité de données dans l'UI.
2. Finaliser la stratégie de source de vérité entre `computations.ts` et `portfolioAnalytics.ts`.
3. Ajouter une résolution manuelle des actifs ambigus.
4. Réintroduire une vue par compte utile si le produit doit vraiment rivaliser avec un agrégateur.

## Conclusion

Le dépôt est déjà au-delà d'un simple tracker local. Les fondations nécessaires à un produit "CSV-first pour bourse + crypto" sont en place.

Le principal écart avec Finary n'est plus l'absence de modèle métier, mais l'écart entre ce modèle et l'UX actuellement exposée.
