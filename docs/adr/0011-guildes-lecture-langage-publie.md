# ADR-0011 - Score des guildes tenu par une projection du langage publié du Village et du Donjon

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le score d'une guilde est la somme des contributions de ses membres actuels : l'or rapporté par
les expéditions gagnées, plus 10 points par amélioration de bâtiment (règle 10 de la fiche de
cadrage). Ces informations n'appartiennent pas au module Guildes : elles sont produites par le
Village et par le Donjon.

- Le Village enregistre `BuildingUpgraded` dans le flux `village-<joueur>`. Le Donjon enregistre
  `GameEnded`, qui porte le résultat, le butin et la liste des héros (`heroIds`), dans le flux
  `dungeon-<expédition>`. Ces noms, ces données et ces préfixes forment leur langage publié, déjà
  lu par le Classement (ADR-0006).
- Un module ne peut importer d'un autre que ses entrées publiques ; il n'importe jamais les
  tables d'un autre module ni celles de la plateforme (`.dependency-cruiser.cjs`).
- Le module Guildes n'a rien à demander aux autres modules : il ne retire ni ne verse de
  ressources, et n'attend aucune réponse.
- L'hébergement ne fournit pas de tâche de fond fiable (ADR-0004) : un modèle de lecture ne peut
  être tenu à jour qu'à l'occasion d'une requête.

## Décision

- Le module lit le journal par une projection, `guild-contributions` (version 1,
  `infrastructure/contributions-projection.ts`), exécutée par le moteur des projections de la
  plateforme. Elle tient, pour chaque joueur, l'or rapporté et le nombre d'améliorations dans la
  table `guild.contributions` (migration `drizzle/0013_contributions_guildes.sql`), avec son
  point de reprise dans `platform.projections`.
- La projection ne traite que deux types : `BuildingUpgraded`, compté pour le joueur désigné par
  le flux `village-<joueur>`, et `GameEnded` gagné, dont le butin est attribué à chaque
  identifiant de `heroIds`. Un événement de même type enregistré hors des préfixes du Village ou
  du Donjon est ignoré. Les préfixes sont importés des contrats publics
  (`VILLAGE_CHANNEL_PREFIX`, `GAME_CHANNEL_PREFIX`) ; la forme des données est décrite à nouveau
  dans le module, comme le fait le Classement.
- La projection est rattrapée à la lecture, par l'adaptateur `ContributionReader`, avant chaque
  consultation du classement des guildes, de la vue d'une guilde et de l'export des données.
- Le score d'une guilde n'est pas stocké : il est calculé par le domaine (`domain/score.ts`), à
  la lecture, à partir des contributions de ses membres actuels. Un joueur qui rejoint une
  guilde y apporte donc toute sa contribution passée, et la retire en la quittant.
- Le module n'écrit jamais dans le journal et n'envoie aucun message par la boîte d'envoi.

### Garanties obtenues

- **Application exactement une fois** : le point de reprise et les tables de la projection sont
  mis à jour dans une même transaction ; une lecture répétée n'applique jamais deux fois un
  événement (`contributions-projection.test.ts`).
- **Cohérence différée, rattrapée à la lecture** : une amélioration est visible dans le score à
  la consultation suivante. Une position manquante récente arrête la projection quelques
  secondes, le temps qu'une insertion en cours se termine (ADR-0006).
- **Reconstruction** : la table peut être vidée et reconstruite à partir du journal ; une
  modification de la règle de contribution se traduit par une nouvelle version de la projection.
- **Aucune dépendance de disponibilité** : le module ne dépend ni du code ni de la disponibilité
  du Village ou du Donjon, seulement de leurs événements déjà enregistrés.

## Conséquences

### Positives

- Le module communique avec deux modules existants sans en modifier aucun, ni leurs contrats,
  ni leurs gestionnaires.
- Le score est toujours cohérent avec la composition actuelle de la guilde, sans traitement à
  l'arrivée ou au départ d'un membre.
- La règle de contribution est isolée dans le domaine : changer le poids d'une amélioration ne
  touche ni la projection ni la base.
- Le mécanisme est celui du Classement : il ne demande aucune notion nouvelle, et le moteur des
  projections est déjà éprouvé.

### Négatives

- Le module dépend de la forme des données de `GameEnded` (`result`, `loot`, `heroIds`) : une
  évolution de ce langage par le Donjon, sans nouvelle version de la projection, fausserait les
  scores. Rien ne le détecte automatiquement.
- La projection lit tout le journal au premier rattrapage, et chaque lecture du classement
  déclenche un rattrapage, comme pour le Classement.
- Les compagnons figurent dans `heroIds` : ils reçoivent une contribution inutile, sans effet
  puisqu'ils ne sont membres d'aucune guilde.
- Le classement est calculé en mémoire pour toutes les guildes à chaque consultation
  (dette DT-011).
- La contribution d'un joueur effacé reste dans la table, sans nom : elle serait recalculée à
  partir du journal par une reconstruction.

## Alternatives écartées

- **Lire la table du Classement (`ranking.players`)**, qui contient déjà l'or et les
  améliorations : ce serait importer les tables d'un autre module, ce que les règles de
  dépendance interdisent, et lier le module au modèle de lecture d'un autre.
- **Exposer un lecteur dans le contrat du Classement** : le module Guildes dépendrait alors du
  Classement plutôt que des producteurs des faits, et le Classement deviendrait un point de
  passage obligé, sans raison métier.
- **Messages de la boîte d'envoi** : le Village et le Donjon devraient envoyer un message à chaque
  amélioration et chaque expédition, ce qui modifierait deux modules existants pour un besoin de
  lecture seule. La lecture du journal fournit la même information sans les modifier.
- **Score stocké et mis à jour à chaque événement** : l'arrivée ou le départ d'un membre
  imposerait de recalculer le score, et le score dépendrait de l'ordre des événements et des
  adhésions.

## Réexamen

Cette décision devra être réexaminée si le nombre de guildes rend coûteux le calcul du
classement à chaque consultation, ou si le Donjon fait évoluer la forme de `GameEnded`.

## Usage de l'IA générative

Claude (Anthropic), utilisé comme assistant : explication du principe des projections,
conception de la projection et de ses tests, rédaction de cet ADR. Vérification : exécution des
tests de la projection (application unique, reconstruction, filtrage des flux), du test d'API
qui relie une amélioration du Village au score d'une guilde, et relecture du code de la
projection.