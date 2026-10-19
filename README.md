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

## Architecture

```
app/                  Pages et route unique de l'API (Next.js)
src/
  platform/           Plateforme technique, générique
  modules/            Modules métier, un répertoire par contexte délimité
  bootstrap/          Racine de composition
  ui/                 Thème et composants d'interface partagés
docs/
  adr/                Décisions d'architecture
```

Un module n'est accessible depuis l'extérieur que par ses entrées publiques : `index.ts`
(serveur), `contracts.ts` (types partagés) et `ui.tsx` (interface).

| Module | Rôle | Adresse de l'API |
| --- | --- | --- |
| `system` | Route de santé | `/api/system` |
| `realm` | Village : fondation, production de ressources, amélioration des bâtiments | `/api/realm` |


## Documentation

- [Décisions d'architecture](docs/adr/README.md)
- [Registre de la dette technique](docs/qualite/dette-technique.md)

## Conventions

- Messages de commit conformes à Conventional.
- `pnpm verify` doit réussir avant tout envoi sur la branche `main`.

## Limites actuelles

Le projet est en cours de construction. Toutes les requêtes sont attribuées à un joueur
unique, en attendant l'authentification. Cette limite est recensée dans le registre de
la dette technique.


## Base de données

En développement, la base PostgreSQL est fournie par PGlite et conservée dans le répertoire
`.data/`, exclu du dépôt. Les migrations du répertoire `drizzle/` y sont appliquées au
démarrage. Pour repartir d'une base vide, arrêtez le serveur et supprimez le répertoire `.data/`.

Les tests utilisent une base PGlite en mémoire, recréée pour chaque fichier de test.