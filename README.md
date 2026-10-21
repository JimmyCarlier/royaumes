# Royaumes

Jeu web multijoueur servant de support au module Architecture et pilotage technique.
Le projet est organisé en monolithe modulaire : une application Next.js unique, découpée
en une plateforme technique et en modules métier aux frontières vérifiées automatiquement.

## Prérequis

- Node.js 22 ou supérieur
- pnpm 10

## Démarrage

```bash
pnpm install
pnpm dev
```

L'application est disponible à l'adresse http://localhost:3000.

## Comptes et configuration

L'espace de jeu est réservé aux joueurs connectés. Créez un compte depuis la page
http://localhost:3000/login.

Les variables d'environnement sont documentées dans le fichier `.env.example`. En local,
aucune n'est obligatoire. Pour définir vos propres valeurs, copiez ce fichier en
`.env.local`, qui n'est jamais versionné.

## Commandes

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Serveur de développement |
| `pnpm build` | Construction de la version de production |
| `pnpm start` | Serveur de production (après `pnpm build`) |
| `pnpm lint` | Formatage et analyse statique (Biome), sans modification |
| `pnpm lint:fix` | Application des corrections automatiques de Biome |
| `pnpm lint:archi` | Vérification des règles d'architecture (dependency-cruiser) |
| `pnpm typecheck` | Vérification des types (TypeScript) |
| `pnpm test` | Exécution des tests (Vitest) |
| `pnpm test:coverage` | Exécution des tests et mesure de la couverture (rapport dans `coverage/`) |
| `pnpm verify` | Ensemble des contrôles, à exécuter avant toute publication |
| `pnpm db:generate --name <nom>` | Production d'une migration après la modification d'un fichier `schema.ts` |
| `pnpm exec tsx scripts/simulate-dungeon.ts` | Mesure de l'équilibre du Donjon par la simulation d'expéditions |
| `pnpm db:migrate` | Application des migrations à la base désignée par `DATABASE_URL_UNPOOLED` ou `DATABASE_URL` |
| `pnpm vercel-build` | Construction exécutée par Vercel : contrôles, migrations, puis construction |
| `pnpm exec tsx scripts/load-test.ts <étiquette>` | Test de charge, application de production démarrée ; résultats dans `perf/<étiquette>.json` |
| `pnpm exec tsx scripts/dead-letters.ts` | Liste des messages abandonnés de la boîte d'envoi ; `retry <id>` en relance un |
| `SERVICE_SECRET=<secret> pnpm exec tsx scripts/village-service.ts` | Démarrage du service Village extrait, sur le port 4000 |

## Architecture

```
app/                  Pages et route unique de l'API (Next.js)
src/
  platform/           Plateforme technique, générique
  modules/            Modules métier, un répertoire par contexte délimité
  bootstrap/          Racine de composition de l'application
  services/           Racines de composition des services extraits
  ui/                 Thème et composants d'interface partagés
scripts/              Scripts d'exploitation, de mesure et de démarrage du service extrait
drizzle/              Migrations de la base de données
perf/                 Budget de performance et résultats des tests de charge
docs/
  adr/                Décisions d'architecture
  qualite/            Dette technique et revues
  rgpd/               Registre des traitements et revue de conformité
  architecture.md     Description de l'architecture (modèle C4)
  bilan-technique.md  Bilan technique du projet
```

Un module n'est accessible depuis l'extérieur que par ses entrées publiques : `index.ts`
(serveur), `contracts.ts` (types partagés) et `ui.tsx` (interface).

| Module | Rôle | Adresse de l'API |
| --- | --- | --- |
| `system` | Route de santé | `/api/system` |
| `realm` | Village : fondation, production de ressources, amélioration des bâtiments | `/api/realm` |
| `dungeon` | Donjon : expéditions de un à quatre héros, compagnons pilotés par l'ordinateur, deux niveaux de difficulté, combats en manches simultanées | `/api/dungeon` |
| `ranking` | Classement des joueurs, construit à partir des événements du Village et du Donjon | `/api/ranking` |
| `market` | Marché : échanges de ressources entre joueurs, par une saga orchestrée | `/api/market` |
| `tavern` | Taverne : salon de discussion commun et présence des joueurs, sans Event Sourcing | `/api/tavern` |

## Temps réel

Les changements sont diffusés aux navigateurs par des Server-Sent Events, à l'adresse
`/api/stream/<canal>`. Chaque canal n'est accessible qu'aux joueurs connectés autorisés par
la règle du module concerné. Le canal `village-<joueur>` n'est ainsi accessible qu'au
propriétaire du village, et le canal `dungeon-<expédition>` aux seuls membres de l'expédition.

La plupart des canaux correspondent à un flux du journal d'événements. Les canaux `ranking`
et `market` sont des canaux globaux : ils suivent, dans tout le journal, les événements qui
modifient le classement ou la liste des offres, et ne transmettent que ceux qui sont
enregistrés après leur ouverture.

Le canal `tavern` ne lit pas le journal, mais la table des messages de la Taverne : il
transmet chaque nouveau message, avec son contenu, à tous les joueurs connectés.

Les canaux du Donjon, du Classement et du Marché sont discrets : ils ne transmettent que la position,
le type et la version des événements, et chaque navigateur relit sa propre vue, filtrée
par le serveur.

Un flux se ferme de lui-même au bout de 240 secondes, et le navigateur s'y reconnecte
sans perte d'événement. En développement, la variable `STREAM_MAX_SECONDS` permet de
raccourcir cette durée pour observer la reconnexion.

## Échanges entre modules

Une opération qui modifie les données de plusieurs modules, comme un échange du Marché, est
une saga (ADR 0007) : chaque étape est une transaction locale à un module, et les modules
communiquent par des messages enregistrés dans la boîte d'envoi (`platform.outbox`), dans la
même transaction que leurs événements. Les messages sont distribués après chaque commande et
chaque consultation du Marché, et chaque jour par la tâche planifiée `/api/cron/daily`. Leur livraison
est garantie au moins une fois : les gestionnaires de messages sont idempotents. Un message qui
échoue dix fois est abandonné : la tâche quotidienne le signale, et le script
`scripts/dead-letters.ts` permet de l'examiner, puis de le relancer une fois sa cause corrigée.

## Service Village extrait

Le module Village peut s'exécuter dans un service autonome, avec sa propre base (ADR 0009).
Cette configuration sert à vérifier les frontières du module ; elle n'est pas déployée. En
local, démarrez le service, puis l'application, dans deux terminaux, avec le même secret :

```bash
SERVICE_SECRET=<secret> pnpm exec tsx scripts/village-service.ts
REALM_SERVICE_URL=http://localhost:4000 SERVICE_SECRET=<secret> pnpm dev
```

Le service conserve ses données dans `.data/village`. Sans ces deux variables, le Village
s'exécute dans l'application, comme en production.

## Données personnelles

Le jeu traite des données personnelles, recensées dans le
[registre des traitements](docs/rgpd/registre-traitements.md). Chaque joueur peut, depuis la
page « Mes données » :

- télécharger l'ensemble de ses données au format JSON (`GET /api/account/export`) ;
- supprimer son compte (`DELETE /api/account`) : ses données sont supprimées des tables de
  tous les modules, et son nom est remplacé par une mention neutre dans le journal
  d'événements (ADR 0008). Chaque effacement est consigné dans `platform.erasures`.

Les messages de la Taverne sont conservés trente jours, et la présence d'un joueur deux
minutes après son dernier signal. Ces durées sont appliquées à chaque lecture, et chaque jour
par la tâche planifiée `/api/cron/daily`.

## Base de données

En développement, la base PostgreSQL est fournie par PGlite et conservée dans le répertoire
`.data/`, exclu du dépôt. Les migrations du répertoire `drizzle/` y sont appliquées au
démarrage. Pour repartir d'une base vide, arrêtez le serveur et supprimez le répertoire `.data/`.

Les tests utilisent une base PGlite en mémoire, recréée pour chaque fichier de test.

Le classement et la liste des expéditions ouvertes sont des modèles de lecture, tenus à jour
par des projections à partir du journal d'événements (ADR 0006). Chaque projection est
rattrapée à la consultation, et reconstruite automatiquement lorsque sa version change :
une modification qui change le contenu de ses tables doit donc augmenter sa version.

En production, la base est hébergée par Neon. Les migrations y sont appliquées lors de
chaque déploiement, après les contrôles et avant la construction de l'application.

## Performance

Le script `scripts/load-test.ts` mesure le débit et les latences des principales lectures,
sous une charge de vingt connexions simultanées, et confronte les résultats au budget de
performance de `perf/budget.json` : 99 % des lectures servies en moins de 500 ms, sans
erreur. Il est exécuté sur la construction de production, base recréée, avec
`AUTH_RATE_LIMIT=off`, avant chaque publication qui touche aux performances.

## Déploiement

L'application est déployée sur Vercel, dans la région de Francfort ; son adresse est
indiquée dans la rubrique « About » du dépôt GitHub. Chaque envoi sur la branche `main`
déclenche un déploiement, qui n'aboutit que si `pnpm verify` réussit.

Les variables `DATABASE_URL` et `DATABASE_URL_UNPOOLED` sont fournies par l'intégration
Neon de Vercel. Les variables `BETTER_AUTH_SECRET` et `CRON_SECRET` sont définies dans les
réglages du projet Vercel ; elles ne sont jamais versionnées. L'application refuse de démarrer
sans la première ; sans la seconde, la route des tâches quotidiennes reste fermée.

## Documentation

- [Architecture](docs/architecture.md)
- [Décisions d'architecture](docs/adr/README.md)
- [Registre de la dette technique](docs/qualite/dette-technique.md)
- [Revue de sécurité de l'authentification](docs/qualite/revue-securite-authentification.md)
- [Revue de sécurité du Donjon](docs/qualite/revue-securite-donjon.md)
- [Revue de sécurité du Marché](docs/qualite/revue-securite-marche.md)
- [Registre des traitements](docs/rgpd/registre-traitements.md)
- [Revue de conformité au RGPD](docs/rgpd/revue-conformite.md)
- [Bilan technique](docs/bilan-technique.md)

## Conventions

- Messages de commit conformes à Conventional Commits.
- `pnpm verify` doit réussir avant tout envoi sur la branche `main`.

## Limites actuelles

Chaque flux temps réel relit le journal d'événements deux fois par seconde : la charge de
la base croît avec le nombre de joueurs connectés. Ce compromis, acceptable pour le nombre
de joueurs du projet, est décrit dans l'ADR 0003.

Une échéance du Donjon, de manche ou d'exploration, n'est enregistrée qu'à la commande
suivante d'un membre de l'expédition ; toute lecture l'affiche néanmoins comme passée
(ADR 0004). Les expéditions de quatre joueurs restent faciles, même au niveau difficile :
le script de simulation permet de le mesurer.

Le classement et la liste des expéditions ouvertes peuvent présenter, pendant quelques
secondes, un état qui ne tient pas encore compte des derniers événements. La reconstruction
d'une projection a lieu pendant une consultation : sa durée croît avec la taille du journal
(ADR 0006).

Une offre échue n'est plus proposée ni acceptée, mais ses ressources ne sont restituées au
vendeur qu'à la consultation suivante du Marché, ou au plus tard lors de la tâche planifiée
quotidienne.

L'effacement d'un compte parcourt tout le journal d'événements : sa durée croît avec la taille
du journal. L'identifiant d'un joueur effacé reste dans le journal, sous une forme
pseudonymisée : plus aucune table ne le relie à une personne (ADR 0008).

Le service Village extrait n'est pas prêt pour la production : ses migrations, la pagination
de son flux publié et la distribution de sa boîte d'envoi restent à traiter. Ces limites, et
les autres limites connues, sont recensées dans le registre de la dette technique.