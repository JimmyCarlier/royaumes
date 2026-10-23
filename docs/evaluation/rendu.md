# Rendu de l'évaluation

- Auteur : Jimmy Carlier
- Module : `guild` (les Guildes)
- Adresse du déploiement : https://royaumes-qc4uqadn9-jimmy-bef5.vercel.app/login
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

Les tests cités sans chemin se trouvent dans `src/bootstrap/guild-api.test.ts` (API, 27 tests).
Les tests du domaine se trouvent dans `src/modules/guild/domain/` (`guild.test.ts`,
`score.test.ts`, `view.test.ts`, 28 tests) ; ils portent le numéro de la règle de la fiche qu'ils
vérifient (« Règle 1 - longueur du nom »...).

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/guild/` : `domain/`, `application/`, `infrastructure/`, `api.ts`, `index.ts`, `contracts.ts`, `ui.tsx`, `personal-data.ts` | `pnpm lint:archi` (règles `module-encapsulation`, `pure-domain`, `application-ignores-infrastructure`, `client-without-server-code`) |
| E2 | `src/bootstrap/create-api.ts` (instanciation, route `/guild`, canal, tâche, données personnelles) ; `src/ui/app-shell.tsx` (entrée « Guildes ») ; `app/(jeu)/guild/page.tsx` | Tous les tests de l'API, qui passent par l'application assemblée (`createTestApi`) |
| E3 | `src/modules/guild/domain/guild.ts` (règles 1 à 9), `domain/score.ts` (règle 10), `domain/view.ts` | Les 28 tests du domaine, sans base ni HTTP ; règle `pure-domain` |
| E4 | Tables classiques dans le schéma `guild` : `infrastructure/schema.ts`, migrations `drizzle/0012_guildes.sql`, `0013_contributions_guildes.sql`, `0014_activite_guildes.sql` ; adaptateur `infrastructure/drizzle-guild-repository.ts` ; justification dans l'ADR 0010 | « n'accepte qu'une fondation lorsque deux joueurs choisissent le même nom au même instant » ; fonction d'aptitude « range chaque table dans le schéma d'une brique de la plateforme ou d'un module » |
| E5 | `create-api.ts` (`app.use('/guild/*', requireUser(auth))`) ; `api.ts` (auteur toujours `c.var.userId`, `validateJson`, `validateParams`) ; `contracts.ts` (schémas Zod) | « refuse toute requête anonyme (401) », « refuse un identifiant mal formé dans l'adresse (400) », « refuse un nom trop court (422), ou démesuré (400) », « refuse qu'un simple membre accepte une demande (403) », « refuse au chef d'une autre guilde d'accepter ou de refuser la demande (403) » ; revue de sécurité, exigences G1 à G4 |
| E6 | Lecture du langage publié du Village et du Donjon : `infrastructure/contributions-projection.ts`, qui n'importe que `VILLAGE_CHANNEL_PREFIX` et `GAME_CHANNEL_PREFIX` de leurs contrats ; ADR 0011 | `infrastructure/contributions-projection.test.ts` (5 tests) ; « compte les améliorations du Village des membres, à 10 points chacune » |
| E7 | `src/modules/guild/personal-data.ts`, déclaré dans `create-api.ts` avant l'identité | « exporte l'appartenance, la demande et la contribution du joueur », « efface le joueur : la guilde passe à un autre membre, et son nom disparaît » ; fonction d'aptitude « déclare les données personnelles de chaque module qui conserve des données » |
| E8 | Correspondance règle → test et route → test ci-dessous | 61 tests ajoutés au total (voir les indicateurs) |
| E9 | `.dependency-cruiser.cjs` et `src/bootstrap/architecture.test.ts` non modifiés | `pnpm lint:archi` : aucune violation ; `architecture.test.ts` : 2 tests réussis |
| E10 | Migrations appliquées par `pnpm vercel-build` (`db:migrate`) | Parcours sur le déploiement de production : [à réaliser avant de poser l'étiquette] |

### Correspondance entre les règles de la fiche et les tests

| Règle | Tests du domaine | Tests de l'API |
| --- | --- | --- |
| 1. Longueur du nom | « Règle 1 - longueur du nom » (3 tests) | « fonde une guilde dont le joueur devient le chef (201) », « refuse un nom trop court (422), ou démesuré (400) » |
| 2. Nom unique, sans tenir compte des majuscules | « Règle 2 - unicité du nom » (2 tests) | « refuse un nom déjà pris, sans tenir compte des majuscules (409) », « n'accepte qu'une fondation lorsque deux joueurs choisissent le même nom au même instant » |
| 3. Une seule guilde par joueur | « Règle 3 - une seule guilde par joueur » (3 tests) | « refuse à un membre de fonder une seconde guilde (409) » |
| 4. Le fondateur est chef | « Règle 4 - le fondateur est chef » | « fonde une guilde dont le joueur devient le chef (201) » |
| 5. Au plus huit membres | « Règle 5 - au plus huit membres » (2 tests) | « refuse la demande adressée à une guilde complète (409) » |
| 6. Une seule demande en attente | « Règle 6 - une seule demande en attente » (2 tests) | « refuse une demande vers une guilde inconnue (404) ou une seconde demande (409) » |
| 7. Décisions réservées au chef | « Règle 7 - les décisions du chef » (3 tests) | « refuse qu'un simple membre accepte une demande (403) », « refuse au chef d'une autre guilde d'accepter ou de refuser la demande (403) », « exclut un membre (200), mais pas le chef lui-même (409) » |
| 8. Expiration après 72 heures | « Règle 8 - expiration des demandes » (2 tests) ; « ne présente plus une demande expirée, au chef comme au demandeur » | « refuse d'accepter une demande expirée (409), qui disparaît des vues » |
| 9. Départ du chef, dissolution | « Règle 9 - départ du chef et dissolution » (4 tests) | « confie la guilde au plus ancien membre lorsque le chef la quitte », « dissout la guilde lorsque son dernier membre la quitte » |
| 10. Score et classement | « Règle 10 - score et classement des guildes » (3 tests) ; « ne compte que les membres actuels de la guilde » | « compte les améliorations du Village des membres, à 10 points chacune » |

### Correspondance entre les routes et les tests

| Route | Tests de l'API |
| --- | --- |
| `GET /api/guild/me` | « présente la demande au demandeur et au seul chef » |
| `GET /api/guild/guilds` | « compte les améliorations du Village des membres, à 10 points chacune » |
| `POST /api/guild/guilds` | « fonde une guilde dont le joueur devient le chef (201) » et les tests de la règle 2 |
| `POST /api/guild/guilds/:id/requests` | « refuse une demande vers une guilde inconnue (404) ou une seconde demande (409) » |
| `DELETE /api/guild/requests/mine` | « retire la demande du joueur, puis refuse de retirer une demande absente (404) » |
| `POST /api/guild/requests/:id/accept` | « accepte une demande : le demandeur devient membre » |
| `POST /api/guild/requests/:id/refuse` | « refuse une demande : elle est supprimée (200), puis introuvable (404) » |
| `POST /api/guild/members/:playerId/kick` | « exclut un membre (200), mais pas le chef lui-même (409) » |
| `POST /api/guild/leave` | « confie la guilde au plus ancien membre lorsque le chef la quitte », « refuse le départ d'un joueur sans guilde (404) » |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B1 | Canal temps réel `guild-<identifiant>`, réservé aux membres de la guilde, alimenté par la table `guild.activity` ; extension de la plateforme pour qu'une source serve plusieurs canaux | `src/modules/guild/index.ts` (`channelPolicy`), `infrastructure/schema.ts` (`activity`), `src/platform/realtime/channel-policy.ts`, `stream-api.ts`, `ui.tsx` (`useChannel`) | « annonce les changements de la guilde à ses membres, sans données », « refuse le canal d'une guilde à un joueur qui n'en est pas membre (403) », « ne transmet pas les changements d'une autre guilde » ; `src/platform/realtime/stream-api.test.ts` : « fournit à la source le nom du canal, qui ne transmet que ses propres éléments » | ADR 0012 ; README, section « Temps réel » ; `architecture.md` |
| B2 | Échéance des demandes (72 heures) évaluée à la lecture et à l'acceptation, sans tâche de fond ; tâche quotidienne propre au module, qui supprime les demandes expirées et l'activité de plus de sept jours | `domain/guild.ts` (`isExpired`, `pendingRequest`), `domain/view.ts`, `application/guild-service.ts` (`purge`), `create-api.ts` (tâche `guild`) | « Règle 8 - expiration des demandes », « refuse d'accepter une demande expirée (409), qui disparaît des vues », « supprime les demandes expirées, et seulement elles » | ADR 0010 ; README, section « Données personnelles » ; `architecture.md`, section « Déploiement » |
| B4 | Projection `guild-contributions` (version 1), avec son point de reprise dans `platform.projections`, rattrapée à la lecture | `infrastructure/contributions-projection.ts`, `infrastructure/drizzle-contribution-reader.ts` | `contributions-projection.test.ts` : application unique, reconstruction à l'identique et position du point de reprise | ADR 0011 ; `architecture.md` (diagramme de séquence) ; README, section « Base de données » |
| B6 | Communication avec deux modules existants : lecture de `BuildingUpgraded` (Village) et de `GameEnded` (Donjon) | `infrastructure/contributions-projection.ts` | `contributions-projection.test.ts` : « compte les améliorations du Village de chaque joueur... », « attribue l'or d'une expédition gagnée à chacun de ses héros... » ; test d'API du classement | ADR 0011 ; `architecture.md` |

## Écarts avec la fiche de cadrage

- Le canal temps réel (bonus B1) a demandé une modification de la plateforme : la source d'un
  canal reçoit désormais le nom du canal. La fiche ne l'annonçait pas ; la décision est consignée
  dans l'ADR 0012.
- Un comportement non décrit par la fiche a été ajouté : un joueur qui fonde une guilde alors
  qu'il a une demande en attente ailleurs renonce à cette demande, qui est supprimée.
- La fiche visait aussi le bonus B8 (fonction d'aptitude) : il n'a pas été réalisé.
- Aucune règle ni aucune action annoncée n'a été abandonnée.

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 238 (33 fichiers) | 299 (38 fichiers) |
| Couverture des lignes | 75,14 % | 76,04 % |
| Violations des règles d'architecture | 0 | 0 |

## Usage de l'IA générative

- Outil : Claude (Anthropic), utilisé comme assistant pédagogique et de code.
- Méthode : le module a été construit étape par étape (domaine, stockage, dépôt, service,
  projection, API, interface, canal temps réel, documentation). À chaque étape, l'assistant a
  expliqué la notion, proposé le contenu des fichiers et les points à savoir défendre ; l'auteur
  a intégré les fichiers, lancé les vérifications et corrigé les erreurs rencontrées.
- Code et tests : contenu des fichiers du module et de leurs tests proposé par l'assistant,
  intégré et vérifié par l'auteur.
- Documents : fiche de cadrage, ADR 0010 à 0012, revue de sécurité, entrées des registres,
  mises à jour de l'architecture, du README et du bilan, et ce document, rédigés avec l'assistant
  puis relus par l'auteur.
- Vérifications : `pnpm verify` après chaque étape ; `pnpm test:coverage` à `td11-fin` et au
  rendu ; parcours à deux joueurs dans le navigateur (fondation, demande reçue en temps réel par
  le chef, acceptation, départ) ; [parcours sur le déploiement de production, à compléter].