# Quick Start

Mise à jour: 2026-03-30

## Démarrage local

```bash
cd "/Users/romain/Investment Tracker"
npm install
npm run dev
```

Application Vite par défaut: `http://localhost:5173`

## Parcours recommandé

### 1. Vérifier la surface réelle

- `/` -> dashboard
- `/settings` -> import, clé Twelve Data, seed, reset

Les autres routes redirigent actuellement vers `/settings`.

### 2. Charger des données

Deux options simples:

- `Réglages -> Ajouter des données de test`
- ou importer un CSV dans `Réglages -> CsvImportSection`

### 3. Contrôler la valorisation

Depuis le dashboard:

- vérifier les positions consolidées
- vérifier la valeur totale EUR
- déclencher un refresh live si vous avez une clé Twelve Data valide

## Workflow d'import

### Import transactions

À utiliser pour des exports de courtier ou d'exchange détaillant:

- achats
- ventes
- dividendes
- frais
- dépôts / retraits
- transferts

### Import snapshots mensuels

À utiliser pour:

- relevés de positions consolidées
- exports `Interactive Brokers / Open Position Summary`

Le système distingue volontairement ces deux modes. Ne pas les intervertir sans raison.

## Commandes utiles

```bash
npm run dev
npm run test -- --run
npm run lint
npm run build
npm run preview
```

## Si vous reprenez le projet

Lire dans cet ordre:

1. [README.md](README.md)
2. [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
3. [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md)

Puis inspecter:

- [src/App.tsx](src/App.tsx)
- [src/features/import/CsvImportSection.tsx](src/features/import/CsvImportSection.tsx)
- [src/repositories/adminRepository.ts](src/repositories/adminRepository.ts)
- [src/lib/assetResolver.ts](src/lib/assetResolver.ts)

## Dépannage rapide

### Les prix live ou le FX ne reviennent pas

- vérifier la clé Twelve Data dans `Réglages`
- sinon l'application retombe sur la clé `demo`, très limitée

### Un import semble incomplet

- regarder les erreurs de parsing dans l'aperçu
- vérifier si la source détectée est la bonne
- vérifier si l'actif est `AMBIGUOUS` ou `UNRESOLVED` côté audit d'import

### Le dashboard affiche une valeur partielle

Ca signifie généralement qu'il manque:

- un `PriceSnapshot`
- ou un `FxSnapshot`
- ou un coût de revient complet sur certaines lignes
