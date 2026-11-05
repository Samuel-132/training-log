# Training Log

Application React et TypeScript, en français, pensée pour iPhone et utilisable hors ligne. Les données restent dans IndexedDB, par navigateur et appareil. Ne jamais ajouter de données personnelles ou de sauvegardes utilisateur dans Git.

## Développement

- Node.js 24 : `npm ci`, `npm run dev`.
- `src/domain.ts` définit le format persistant versionné et la validation. Prévoir une migration explicite pour tout changement de format.
- `src/storage.ts` est le seul accès IndexedDB. Les mutations doivent lire le dernier état dans une transaction atomique. Aucun repli silencieux sur des données vides.
- Les composants d’interface vivent dans `src/components`. Garder les règles de validation dans le domaine.
- Les sauvegardes doivent rester réimportables. Une restauration remplace le carnet uniquement après confirmation explicite dans l’interface.
- Ne pas ajouter de compte, de synchronisation, de télémétrie ou de service payant sans demande utilisateur.

## Validation et revue

Avant une PR : `npm run check` et `npm run build`. Ajouter des tests pour les changements des règles métier, du stockage et du comportement hors ligne. Vérifier l’interface à une largeur iPhone ; éviter les champs de taille inférieure à 16px sur iOS.

Utiliser des branches `codex/*`, des PR ciblées et une revue indépendante avant fusion. Documenter les corrections et les limites de vérification dans les PR. Ne jamais prétendre avoir testé sur un iPhone physique si seul un navigateur de bureau a été utilisé.
