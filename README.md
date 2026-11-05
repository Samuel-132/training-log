# Training Log

Un carnet de musculation en français, conçu pour retrouver sa dernière performance avant de recommencer un exercice.

## Fonctionnalités

- Catalogue initial modifiable et ajout d’exercices personnalisés.
- Performances datées, avec répétitions et poids indépendants pour chaque série.
- Dernière séance détaillée, reprise de ses séries, historique modifiable et courbe de charge maximale.
- Statistiques de la semaine et recherche par exercice ou groupe musculaire.
- Export et restauration JSON, avec validation et confirmation avant remplacement.

Exemple pour le curl : 10 répétitions à 10 kg, puis 8 à 10 kg, puis 9 à 8 kg. Les trois séries sont conservées séparément. Le volume est de 252 kg.

## Données et confidentialité

Chaque utilisateur possède son propre carnet sur son appareil, sans compte. Les données restent dans IndexedDB et ne sont pas envoyées à un serveur. Les utilisateurs d’un même navigateur et profil partagent le même carnet. Le code public ne contient aucun historique personnel.

Changer d’appareil, de navigateur ou effacer les données du navigateur peut faire perdre le carnet. Faire des exports réguliers. L’import **remplace** toutes les données présentes ; il ne fusionne pas les carnets. La limite de sauvegarde est de 10 Mio en UTF-8 ; les écritures sont contrôlées pour garantir que tout export reste réimportable. Les erreurs de stockage ou de quota sont signalées sans remise à zéro silencieuse.

## Développement

Node.js 24 est requis.

```sh
npm ci
npm run dev
npm run check
npm run build
npm run preview
```

Pour un hébergement dans un sous-dossier, définir `BASE_PATH=/training-log/` lors du build.

## Architecture

- `src/domain.ts` : types, validation du format v1, métriques, dates et sauvegardes.
- `src/storage.ts` : IndexedDB, transactions atomiques et notifications entre onglets.
- `src/components/` : répertoire, formulaires, boîte de dialogue et graphique accessibles.
- `src/App.tsx` : navigation, orchestration des actions et historique.

Les performances sont triées par date de séance, puis date de création et identifiant. Une saisie antidatée ne remplace donc pas la véritable dernière séance. Pour comparer les performances, garder la même convention de charge (poids par haltère ou poids total barre comprise). Aucune estimation de charge maximale sur une répétition n’est calculée.

## Contributions

Branches `codex/*`, PR ciblées, tests métier et de stockage, build de production et revue indépendante avant fusion. Voir [AGENTS.md](AGENTS.md).
