# Training Log

Un carnet de musculation en français, conçu pour retrouver sa dernière performance avant de recommencer un exercice.

**[Ouvrir l’application](https://samuel-132.github.io/training-log/)** · **[Dépôt GitHub](https://github.com/Samuel-132/training-log)**

## Fonctionnalités

- Catalogue initial modifiable et ajout d’exercices personnalisés.
- Performances datées, avec répétitions et poids indépendants pour chaque série.
- Dernière séance détaillée, reprise de ses séries, historique modifiable et courbe de charge maximale.
- Statistiques de la semaine et recherche par exercice ou groupe musculaire.
- Export et restauration JSON, avec validation et confirmation avant remplacement.
- Installation sur l’écran d’accueil et fonctionnement hors ligne après un premier chargement complet.

Exemple pour le curl : 10 répétitions à 10 kg, puis 8 à 10 kg, puis 9 à 8 kg. Les trois séries sont conservées séparément. Le volume est de 252 kg.

## Données et confidentialité

Chaque utilisateur possède son propre carnet sur son appareil, sans compte. Les données restent dans IndexedDB et ne sont pas envoyées à un serveur. Les utilisateurs d’un même navigateur et profil partagent le même carnet. Le code public ne contient aucun historique personnel.

Changer d’appareil, de navigateur ou effacer les données du navigateur peut faire perdre le carnet. Faire des exports réguliers. L’import **remplace** toutes les données présentes ; il ne fusionne pas les carnets. La limite de sauvegarde est de 10 Mio en UTF-8 ; les écritures sont contrôlées pour garantir que tout export reste réimportable. Les erreurs de stockage ou de quota sont signalées sans remise à zéro silencieuse.

Sur iPhone, Safari et l’app installée peuvent posséder des stockages distincts. Installer l’app **avant** de saisir les séances ; sinon exporter depuis Safari puis importer dans l’app installée. Voir [l’explication de WebKit sur le stockage des apps web](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).

## Installation sur iPhone

1. Ouvrir l’adresse de l’app dans Safari.
2. Ouvrir le menu de partage, puis **Sur l’écran d’accueil**.
3. Activer **Ouvrir comme app web** si proposé, puis **Ajouter**.
4. Ouvrir l’icône Training Log avec une connexion et attendre **Prêt hors ligne**.

Les instructions sont aussi disponibles dans **Sauvegardes**. Ensuite, l’app peut être ouverte et les performances saisies sans connexion. La première visite nécessite Internet. Les mises à jour attendent une action explicite ; aucun rechargement automatique n’interrompt une saisie. [Guide Apple](https://support.apple.com/fr-ma/guide/iphone/iphea86e5236/ios).

## Développement

Node.js 24 est requis.

```sh
npm ci
npm run dev
npm run check
npm run build
npm run preview
npm run format:check
```

Pour un hébergement dans un sous-dossier, définir `BASE_PATH=/training-log/` lors du build.

Utiliser le même `BASE_PATH` pour l’aperçu : `BASE_PATH=/training-log/ npm run preview`.

## Architecture

- `src/domain.ts` : types, validation du format v1, métriques, dates et sauvegardes.
- `src/storage.ts` : IndexedDB, transactions atomiques et notifications entre onglets.
- `src/components/` : répertoire, formulaires, boîte de dialogue et graphique accessibles.
- `src/App.tsx` : navigation, orchestration des actions et historique.
- `src/usePwa.ts` : préparation hors ligne et proposition de mise à jour explicite.
- `scripts/build-service-worker.mjs` : génération du cache avec les fichiers exacts de chaque build.
- `scripts/service-worker.test.mjs` : tests du cache, des scopes et de la génération.

Les performances sont triées par date de séance, puis date de création et identifiant. Une saisie antidatée ne remplace donc pas la véritable dernière séance. Pour comparer les performances, garder la même convention de charge (poids par haltère ou poids total barre comprise). Aucune estimation de charge maximale sur une répétition n’est calculée.

## Hébergement gratuit

Le dépôt est public, et le site statique est publié sur GitHub Pages par `.github/workflows/deploy.yml` après chaque fusion vers `main`. Aucun serveur de données, aucune clé API et aucun abonnement ne sont nécessaires. GitHub Pages doit être configuré avec **GitHub Actions** comme source de déploiement. [Conditions de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Le service worker ne met en cache que les ressources statiques de l’application. Il n’intercepte pas les requêtes externes ni les requêtes hors de son scope et n’efface pas le cache d’une autre PWA du même domaine. Les données de séances restent dans IndexedDB, séparément du cache applicatif. Le mode hors ligne doit être confirmé par le badge de l’interface avant une utilisation sans réseau.

## Vérifications

`npm run check` exécute la compilation stricte, les tests métier/IndexedDB et les tests du service worker. Ces derniers simulent le réseau indisponible, les ressources en cache, l’isolation des scopes, les mises à jour et la génération déterministe. Vérifier aussi l’interface dans un navigateur à une largeur iPhone. Une simulation sur ordinateur ne remplace pas un essai sur un iPhone physique ; pour une recette complète, installer depuis Safari, saisir une séance, fermer l’app, passer en mode avion, rouvrir et contrôler la persistance après une nouvelle saisie.

## Contributions

Branches `codex/*`, PR ciblées, tests métier et de stockage, build de production et revue indépendante avant fusion. Voir [AGENTS.md](AGENTS.md).
