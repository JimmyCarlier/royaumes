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
| `pnpm verify` | Ensemble des contrôles, à exécuter avant toute publication |
| `pnpm db:generate --name <nom>` | Production d'une migration après la modification d'un fichier `schema.ts` |
| `pnpm exec tsx scripts/simulate-dungeon.ts` | Mesure de l'équilibre du Donjon par la simulation d'expéditions |
| `pnpm db:migrate` | Application des migrations à la base désignée par `DATABASE_URL_UNPOOLED` ou `DATABASE_URL` |
| `pnpm vercel-build` | Construction exécutée par Vercel : contrôles, migrations, puis construction |

## Architecture

```
app/                  Pages et route unique de l'API (Next.js)
src/
  platform/           Plateforme technique, générique
  modules/            Modules métier, un répertoire par contexte délimité
  bootstrap/          Racine de composition
  ui/                 Thème et composants d'interface partagés
scripts/              Scripts d'exploitation (migrations)
drizzle/              Migrations de la base de données
docs/
  adr/                Décisions d'architecture
  qualite/            Dette technique et revues
  architecture.md     Description de l'architecture (modèle C4)
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
est garantie au moins une fois : les gestionnaires de messages sont idempotents.

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
pseudonymisée : plus aucune table ne le relie à une personne (ADR 0008). Les autres limites
connues, dont le traitement des messages abandonnés, sont recensées dans le registre de la
dette technique.