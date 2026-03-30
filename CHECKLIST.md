# Agent Takeover Checklist

Mise à jour: 2026-03-30

Cette checklist sert à reprendre le projet sans repartir d'une documentation historique obsolète.

## Avant toute modification

- [ ] Lire [README.md](README.md) et [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
- [ ] Vérifier les routes actives dans [src/App.tsx](src/App.tsx)
- [ ] Vérifier le worktree courant avec `git status --short`
- [ ] Identifier si le changement touche la surface active (`Dashboard`, `Settings`, import) ou un module hérité

## Si le sujet touche l'import

- [ ] Relire [src/features/import/CsvImportSection.tsx](src/features/import/CsvImportSection.tsx)
- [ ] Relire [src/lib/csvImport.ts](src/lib/csvImport.ts)
- [ ] Relire [src/repositories/adminRepository.ts](src/repositories/adminRepository.ts)
- [ ] Vérifier l'impact sur la déduplication (`fileFingerprint`, empreintes canoniques)
- [ ] Vérifier l'impact sur `ImportJob` / `ImportRow`

## Si le sujet touche l'identité d'actif

- [ ] Relire [src/lib/assetIdentity.ts](src/lib/assetIdentity.ts)
- [ ] Relire [src/lib/assetResolver.ts](src/lib/assetResolver.ts)
- [ ] Vérifier les cas `RESOLVED`, `AMBIGUOUS`, `UNRESOLVED`
- [ ] Ne pas retomber sur un matching purement par ticker si ce n'est pas explicitement voulu

## Si le sujet touche holdings ou valorisation

- [ ] Vérifier si la source de vérité active est `computePortfolioSummary()`
- [ ] Vérifier si le changement devrait aussi s'appliquer à `analyzePortfolio()`
- [ ] Préserver la distinction entre transactions réelles et transactions synthétiques de snapshot
- [ ] Vérifier les effets sur le dashboard

## Validation minimale

- [ ] `npm run test -- --run`
- [ ] `npm run lint`
- [ ] `npm run build`

## Avant de clore le travail

- [ ] Mettre à jour la documentation si la surface produit, le schéma ou les invariants ont changé
- [ ] Éviter les chiffres fragiles du type "100% complet" ou "X lignes de code"
- [ ] Indiquer clairement ce qui est actif, hérité, expérimental ou en cours de migration
