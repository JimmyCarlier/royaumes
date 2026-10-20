# Architecture de Royaumes

Ce document décrit la structure du système selon le modèle C4, du plus général au plus
détaillé. Les raisons des choix qui y apparaissent sont consignées dans les
[décisions d'architecture](adr/README.md).

Les diagrammes sont rédigés en Mermaid : ils sont versionnés avec le code, et mis à jour
dans le même commit que la modification qu'ils décrivent.

## Niveau 1 - Contexte

```mermaid
flowchart TB
  joueur["Joueur<br/>[Personne]<br/>Joue depuis un navigateur,<br/>sur ordinateur ou sur téléphone"]
  royaumes["Royaumes<br/>[Système logiciel]<br/>Jeu web multijoueur : village, donjon,<br/>classement, marché et taverne"]
  joueur -->|"Gère son village, joue avec les autres joueurs,<br/>reçoit les changements en direct (HTTPS)"| royaumes
```

Royaumes ne dépend d'aucun système externe : il n'envoie aucun courrier électronique et
ne fait appel à aucun service de paiement ni à aucun fournisseur d'identité. Les comptes
des joueurs sont gérés par le système lui-même.

## Niveau 2 - Conteneurs

```mermaid
flowchart TB
  joueur["Joueur<br/>[Personne]"]
  subgraph royaumes["Système Royaumes"]
    web["Interface web<br/>[Conteneur : React, dans le navigateur]<br/>Pages du jeu et page de connexion"]
    serveur["Application serveur<br/>[Conteneur : Next.js et Hono, fonctions Vercel, Francfort]<br/>Rendu des pages, API JSON,<br/>authentification, flux temps réel"]
    base[("Base de données<br/>[Conteneur : PostgreSQL, Neon, Francfort]<br/>Schéma platform : journal d'événements<br/>Schéma identity : comptes et sessions")]
  end
  joueur -->|"Utilise"| web
  web -->|"Pages, appels de l'API avec le cookie de session<br/>(HTTPS, JSON)"| serveur
  serveur -->|"Événements des canaux autorisés<br/>(Server-Sent Events)"| web
  serveur -->|"Lit et écrit<br/>(SQL, connexion mutualisée)"| base
```

| Conteneur | Technologies | Responsabilités |
| --- | --- | --- |
| Interface web | React, composants des modules (`ui.tsx`) | Affichage des vues, envoi des actions du joueur, abonnement aux canaux temps réel |
| Application serveur | Next.js, Hono, Better Auth, Drizzle | Contrôle d'accès, règles du jeu, enregistrement des événements, diffusion des flux |
| Base de données | PostgreSQL (Neon en production, PGlite en local et en test) | Conservation du journal d'événements, des comptes et des sessions |

L'interface web ne communique jamais directement avec la base : toute lecture et toute
écriture passent par l'application serveur, qui applique le contrôle d'accès.

## Niveau 3 - Composants de l'application serveur

```mermaid
flowchart TB
  route["Route d'API<br/>[app/api/[[...route]]/route.ts]<br/>Transmet toute requête /api à Hono"]
  pages["Pages du jeu<br/>[app/(jeu)/]<br/>Vérifient la session avant tout rendu"]
  subgraph bootstrap["src/bootstrap"]
    server["server.ts<br/>Instance unique de l'application,<br/>de la base et de l'authentification"]
    createapi["create-api.ts<br/>Assemble plateforme et modules,<br/>protège les routes"]
  end
  subgraph modules["src/modules"]
    system["system<br/>Route de santé"]
    realm["realm<br/>Village : domaine, service,<br/>dépôt fondé sur le journal, API, canal"]
  end
  subgraph platform["src/platform"]
    auth["auth<br/>Port AuthPort,<br/>adaptateur Better Auth"]
    http["http<br/>Intergiciel requireUser,<br/>validation des requêtes"]
    realtime["realtime<br/>Flux SSE,<br/>règles d'accès aux canaux"]
    store["event-store<br/>Journal d'événements,<br/>concurrence optimiste"]
    db["db<br/>Client Drizzle<br/>(Neon ou PGlite)"]
  end
  base[("Base de données")]
  route --> server
  pages --> server
  server --> createapi
  createapi --> system & realm & auth & http & realtime
  realm --> store & realtime & http
  realtime --> store & http
  http --> auth
  auth --> db
  store --> db
  db --> base
```

Une flèche signifie « dépend de ». Le diagramme ne montre que les dépendances principales :
`server.ts` crée également lui-même la base, le journal et l'adaptateur d'authentification,
qu'il transmet à `create-api.ts`.

Les règles suivantes sont vérifiées automatiquement par
dependency-cruiser (`.dependency-cruiser.cjs`) à chaque exécution de `pnpm verify` :

- la plateforme ne dépend d'aucun module ;
- un module n'est accessible que par ses entrées publiques (`index.ts`, `contracts.ts`, `ui.tsx`) ;
- le domaine d'un module ne dépend d'aucune bibliothèque technique ;
- la couche application d'un module ne dépend pas de sa couche infrastructure ;
- le code destiné au navigateur ne dépend d'aucun code serveur ;
- aucune dépendance circulaire n'est admise.

Seule la racine de composition connaît à la fois la plateforme et l'ensemble des modules.

## Niveau 4 - Code

Ce niveau n'est pas dessiné : il est décrit par le code lui-même et par ses tests, que
tout diagramme maintenu à la main ne tarderait pas à contredire.

## Déploiement

```mermaid
flowchart LR
  poste["Poste de développement"] -->|"git push"| github["GitHub<br/>Dépôt royaumes"]
  github -->|"Déclenche"| build["Construction Vercel<br/>verify, db:migrate, next build"]
  build -->|"Migrations<br/>(connexion directe)"| neon[("Neon<br/>Francfort")]
  build -->|"Publie"| fonctions["Fonctions Vercel<br/>Francfort (fra1)"]
  fonctions -->|"SQL<br/>(connexion mutualisée)"| neon
```

Chaque envoi sur la branche `main` déclenche un déploiement. Le code n'est publié que si
l'ensemble des contrôles a réussi, et les migrations ne sont appliquées qu'après ces contrôles.