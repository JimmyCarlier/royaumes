# ADR-0001 - Monolithe modulaire plutôt que microservices

- Statut : accepté
- Date : 2026-10-14

## Contexte

Royaumes est un jeu multijoueur développé par une seule personne. Il est hébergé sur une
offre gratuite (Vercel Hobby et Neon Free), sans moyen de paiement, et s'adresse à un nombre
modeste de joueurs simultanés.

Le projet a néanmoins vocation à montrer des frontières nettes entre domaines métier
(Village, Donjon, Classement, Marché, Taverne), et doit pouvoir évoluer : il doit rester
possible d'extraire un module en service autonome si un besoin réel apparaît.

L'hébergement sans serveur de Vercel impose par ailleurs ses contraintes : aucune tâche de
fond, durée d'exécution limitée, quotas gratuits partagés entre tous les projets du compte.

## Décision

Le projet est une application Next.js unique, déployée comme un seul projet Vercel et
reposant sur une seule base PostgreSQL. Le code est organisé en deux zones :

- la plateforme technique (`src/platform/`), générique, qui ignore tout du jeu ;
- les modules métier (`src/modules/<nom>/`), un répertoire par contexte délimité.

Chaque module expose une sous-application Hono (`api.ts`) et trois entrées publiques :
`index.ts` pour le serveur, `contracts.ts` pour les types partagés, `ui.tsx` pour l'interface.
La racine de composition (`src/bootstrap/`) est le seul endroit qui assemble plateforme et
modules ; l'API est servie par une route Next.js unique (`app/api/[[...route]]/route.ts`).

Les règles d'encapsulation sont vérifiées automatiquement par dependency-cruiser
(`.dependency-cruiser.cjs`), au sein de la commande `pnpm verify`.

## Conséquences

### Positives

- Un seul dépôt, un seul déploiement : aucune infrastructure à coordonner.
- Aucun appel réseau entre modules : pas de latence ni de défaillance partielle entre eux.
- Les quotas de l'offre gratuite ne sont pas divisés entre plusieurs services.
- Le refactoring entre modules reste simple, avec l'aide du compilateur.
- L'extraction d'un module reste possible : sa sous-application Hono peut être servie seule.

### Négatives

- Tous les modules partagent le même cycle de déploiement : une erreur dans l'un bloque la
  publication de tous.
- Les modules partagent la même base de données ; la séparation repose sur des schémas
  distincts et sur la discipline, non sur une isolation physique.
- Les frontières ne tiennent que grâce aux règles automatisées : les désactiver ou les
  assouplir laisserait le code dériver vers un monolithe sans structure.
- Tous les modules partagent les mêmes ressources d'exécution : il est impossible
  d'allouer davantage de capacité à un seul d'entre eux.

## Alternatives écartées

- **Microservices dès le départ** : chaque service devrait être construit, déployé et
  surveillé séparément, et toute opération touchant plusieurs services exigerait des
  mécanismes de coordination. Ces coûts ne se justifient ni pour une équipe d'une
  personne, ni pour la charge attendue, et les quotas gratuits seraient divisés.
- **Monolithe sans frontières** : plus rapide à démarrer, mais chaque module finirait par
  dépendre du fonctionnement interne des autres, rendant toute évolution ou extraction
  ultérieure coûteuse.
- **Routes d'API Next.js réparties dans `app/api/`** : l'organisation des routes suivrait
  l'arborescence de Next.js et non le découpage en modules, et les routes ne pourraient
  pas être exécutées hors de Next.js.

## Réexamen

Cette décision devra être réexaminée si l'un des modules nécessite une capacité ou un
rythme de déploiement propres, ou si plusieurs équipes doivent travailler sur le projet
de manière indépendante.

## Usage de l'IA générative

Aucun.