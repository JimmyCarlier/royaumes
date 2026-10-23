# ADR-0010 - Module Guildes conservé dans des tables classiques, protégées par des contraintes d'unicité

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le module Guildes (`src/modules/guild/`) permet aux joueurs de se regrouper : un joueur fonde
une guilde dont il devient le chef, d'autres demandent à la rejoindre, le chef accepte, refuse
ou exclut, et chaque guilde reçoit un score collectif. Les dix règles métier figurent dans la
fiche de cadrage (`docs/evaluation/fiche-cadrage.md`).

- Deux règles portent sur l'ensemble des guildes, et non sur une seule : deux guildes ne
  peuvent pas porter le même nom sans tenir compte des majuscules (règle 2), et un joueur
  appartient à au plus une guilde (règle 3). Une troisième porte sur l'ensemble des demandes :
  un joueur n'a qu'une demande en attente (règle 6).
- Plusieurs joueurs peuvent agir au même instant, sur plusieurs instances de l'application qui
  ne partagent pas leur mémoire : deux fondations simultanées du même nom, ou deux acceptations
  simultanées d'un même joueur dans deux guildes, sont possibles.
- Le journal d'événements protège un flux à la fois : la contrainte `(stream, version)` détecte
  deux écritures concurrentes sur un même flux, pas sur deux flux différents (ADR-0002).
- L'historique des adhésions n'a pas de valeur de jeu : aucune règle ni aucun écran ne
  s'appuie sur le passé d'une guilde. Ces données sont destinées à disparaître lorsqu'un joueur
  quitte sa guilde, lorsqu'une guilde est dissoute, ou lorsqu'un compte est effacé.
- Le TD10 a montré, avec la Taverne (ADR-0008), qu'un module dont les données sont destinées
  à disparaître se prête mal à l'Event Sourcing : l'effacement y impose une réécriture ciblée
  du journal.

## Décision

- Le module conserve ses données dans des tables ordinaires, rangées dans le schéma PostgreSQL
  `guild` : `guilds`, `members` et `requests` (migration `drizzle/0012_guildes.sql`). Le module
  n'enregistre aucun événement dans le journal.
- Les règles qui portent sur toutes les guildes sont garanties par des contraintes de la base,
  et non par une lecture préalable seule :
  - une contrainte d'unicité sur `guilds.name_key`, le nom mis en minuscules (règle 2) ;
  - la clé primaire de `members` est l'identifiant du joueur (règle 3) ;
  - une contrainte d'unicité sur `requests.player_id` (règle 6).
- Le domaine (`domain/guild.ts`) reste fait de fonctions pures : il vérifie une action à partir
  de la situation que lui présente le service, sans produire d'événements. Il calcule aussi la
  clé d'unicité d'un nom.
- Chaque commande s'exécute dans une transaction ouverte par le port `GuildRepository`
  (`atomically`). La guilde concernée y est verrouillée (`SELECT ... FOR UPDATE`) : deux
  actions sur une même guilde, par exemple deux acceptations quand il ne reste qu'une place
  (règle 5), sont traitées l'une après l'autre.
- Une violation de contrainte d'unicité est traduite par l'adaptateur en `GuildConflict`, puis
  par le service en erreur métier (`NAME_TAKEN`, `ALREADY_MEMBER`, `REQUEST_PENDING`) : le joueur
  qui arrive second reçoit la même réponse que s'il avait agi après le premier.
- L'expiration d'une demande (règle 8) est évaluée à la lecture et à l'acceptation, à partir de
  sa date d'envoi : aucune tâche de fond n'est nécessaire pour qu'une demande expirée cesse
  d'être présentée ou acceptée. La tâche quotidienne du module, appelée par `/api/cron/daily`,
  ne fait que supprimer les lignes expirées et l'activité de plus de sept jours.
- L'effacement d'un compte retire le joueur de sa guilde selon la règle 9 (transmission du rôle
  de chef ou dissolution) et supprime sa demande (`personal-data.ts`).

## Conséquences

### Positives

- Les règles 2, 3 et 6 restent vraies sous concurrence, quelle que soit l'instance qui traite
  chaque requête : c'est la base qui tranche. Un test le vérifie en envoyant deux fondations
  simultanées du même nom (`src/bootstrap/guild-api.test.ts`).
- L'effacement d'un joueur est une suppression ordinaire de lignes : le journal n'a rien à
  réécrire pour ce module, et aucune copie de son nom ne subsiste.
- Le modèle de données correspond directement aux écrans : la vue d'une guilde se lit en
  quelques requêtes, sans rejeu d'événements.
- Le domaine reste testable sans base : chaque règle est vérifiée par des tests unitaires
  (`domain/guild.test.ts`, `domain/score.test.ts`, `domain/view.test.ts`).

### Négatives

- L'historique est perdu : il est impossible de savoir qui a été membre d'une guilde, ni de
  reconstruire une vue nouvelle du passé, comme le permettent les modules fondés sur le journal.
- Les autres modules ne peuvent pas réagir aux changements des guildes en lisant le journal :
  le module ne publie aucun langage. Un futur module Hauts faits ou Notifications devrait passer
  par un contrat explicite, ou il faudrait revenir sur cette décision.
- Une partie des règles est garantie par la base, et non par le domaine seul : les règles 2, 3
  et 6 sont réparties entre une vérification du domaine et une contrainte de la migration, qu'il
  faut maintenir ensemble.
- Le verrouillage d'une guilde sérialise les actions qui la concernent : sous forte activité
  d'une même guilde, les requêtes attendent leur tour.
- La clé d'unicité dépend de la mise en minuscules de JavaScript (`toLocaleLowerCase('fr')`) :
  deux noms visuellement proches mais composés de caractères différents restent distincts.

## Alternatives écartées

- **Event Sourcing, un flux par guilde** (`guild-<id>`) : la concurrence optimiste protège chaque
  guilde, mais pas les règles 2, 3 et 6, qui portent sur plusieurs flux. Il aurait fallu un flux
  supplémentaire par nom et par joueur, et écrire dans deux flux à la fois, ce que le journal ne
  permet pas atomiquement. L'historique ainsi conservé n'a pas d'usage dans le jeu, et
  l'effacement aurait exigé une réécriture du journal.
- **Event Sourcing, le nom de la guilde comme nom de flux** : la contrainte `(stream, version)`
  aurait garanti l'unicité du nom, mais pas la règle 3, et le nom serait devenu un identifiant
  impossible à modifier.
- **Vérification préalable par une lecture, sans contrainte** : deux requêtes simultanées
  liraient toutes deux « nom disponible » puis écriraient toutes deux. La règle ne serait vraie
  qu'en l'absence de concurrence.
- **Verrouillage applicatif en mémoire** : il ne protège qu'une instance, alors que plusieurs
  instances peuvent traiter les requêtes.

## Réexamen

Cette décision devra être réexaminée si l'historique des guildes acquiert une valeur de jeu
(archives, hauts faits, statistiques sur la durée), ou si un autre module doit réagir aux
changements des guildes : un langage publié dans le journal deviendrait alors préférable.

## Usage de l'IA générative

Claude (Anthropic), utilisé comme assistant : explication des notions, proposition du modèle de
données, des contraintes d'unicité et de la stratégie de verrouillage, et rédaction de cet ADR.
Vérification : relecture de l'ADR au regard du code (`infrastructure/schema.ts`,
`drizzle-guild-repository.ts`, `guild-service.ts`), exécution de `pnpm verify`, et test des
fondations simultanées qui démontre la garantie d'unicité.