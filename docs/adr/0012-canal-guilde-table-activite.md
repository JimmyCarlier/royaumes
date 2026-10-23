# ADR-0012 - Un canal temps réel par guilde, alimenté par une table d'activité

- Statut : accepté
- Date : 2026-10-23

## Contexte

Les membres d'une guilde doivent voir les changements sans recharger la page : une demande
reçue par le chef, l'arrivée ou le départ d'un membre, la transmission du rôle de chef.

- La plateforme temps réel (ADR-0003) diffuse un flux du journal, un canal global du journal, ou
  une source propre à un module, comme la table des messages de la Taverne.
- Le module Guildes n'enregistre pas d'événements (ADR-0010) : son canal ne peut pas lire le
  journal.
- Un canal doit être réservé aux membres de la guilde concernée : un joueur extérieur ne doit
  pas savoir quand une guilde reçoit une demande.
- La source propre d'un module était déclarée par préfixe, sans connaître le canal demandé :
  une même source ne pouvait servir qu'un seul canal, comme `tavern`.

## Décision

- Chaque guilde a son canal, `guild-<identifiant>`. Sa règle d'accès n'autorise que les membres
  actuels de la guilde ; un canal qu'aucune guilde ne couvre est refusé.
- Chaque commande enregistre, dans la même transaction que ses changements, une ligne dans la
  table `guild.activity` (migration `drizzle/0014_activite_guildes.sql`) : l'identifiant de la
  guilde, le type du changement et sa date. Le canal présente ces lignes comme des événements,
  identifiés par l'identifiant croissant de la ligne, ce qui permet la reprise par
  `Last-Event-ID`.
- Les lignes ne contiennent aucune donnée personnelle, et le canal ne transmet que le type du
  changement : chaque abonné relit sa propre vue auprès de l'API, qui applique ses propres
  règles (seul le chef voit les demandes).
- La plateforme transmet désormais le nom du canal à la source d'un module
  (`ChannelSource.read(after, channel)` et `start(channel)`). La modification est
  rétrocompatible : la Taverne ignore ce paramètre et n'est pas modifiée. Un test de la
  plateforme vérifie qu'une source partagée ne transmet que les éléments de son canal.
- L'activité est conservée sept jours, puis supprimée par la tâche quotidienne du module.

## Conséquences

### Positives

- Le chef voit une demande dès qu'elle est envoyée, et les membres voient arriver ou partir
  leurs compagnons, sans interrogation périodique.
- Aucun joueur extérieur ne reçoit l'activité d'une guilde, et un ancien membre ne peut plus
  ouvrir le canal dès qu'il la quitte : la règle d'accès est vérifiée à l'ouverture du flux.
- La table d'activité ne contenant aucun nom, elle n'a pas à être traitée à l'effacement d'un
  compte.
- La plateforme gagne une capacité générique, utilisable par tout module dont les canaux
  dépendent d'un identifiant, sans connaître aucun module.

### Négatives

- La plateforme a été modifiée pour les besoins du module : sa signature `ChannelSource`
  change, et tout module futur doit en tenir compte.
- Chaque commande écrit une ligne supplémentaire, et chaque abonné relit sa vue à chaque
  changement : deux requêtes par notification.
- L'accès n'est vérifié qu'à l'ouverture du flux : un membre exclu peut recevoir, jusqu'à la
  fermeture de son flux (240 secondes au plus), le type des changements suivants. Il ne reçoit
  aucune donnée, et sa relecture de la vue ne lui montre plus la guilde (dette DT-012).
- Un joueur dont la demande est acceptée ou refusée n'est pas encore membre : il n'est pas
  prévenu en temps réel, et voit la décision à sa prochaine consultation.

## Alternatives écartées

- **Écrire l'activité dans le journal**, dans un flux `guild-<identifiant>` : le canal ordinaire
  de la plateforme aurait suffi, sans la modifier. Mais le module aurait enregistré des
  événements sans en tirer son état, contre l'esprit de l'ADR-0010, et ces événements seraient
  restés dans le journal après la dissolution de la guilde.
- **Un canal unique `guild` pour toutes les guildes**, filtré par l'interface : tout joueur
  connecté aurait reçu l'activité de toutes les guildes, ce qui contredit la règle d'accès.
- **Un canal par joueur** : il aurait prévenu le demandeur d'une décision, mais aurait imposé
  d'écrire une ligne par membre à chaque changement, et posé le même problème de source.
- **Interrogation périodique par l'interface** : des requêtes inutiles en l'absence de
  changement, et un délai de rafraîchissement à choisir.

## Réexamen

Cette décision devra être réexaminée si le demandeur doit être prévenu en temps réel de la
décision du chef, ou si la révocation immédiate de l'accès d'un membre exclu devient nécessaire.

## Usage de l'IA générative

Claude (Anthropic), utilisé comme assistant : conception du canal et de la modification de la
plateforme, rédaction de cet ADR. Vérification : tests de la plateforme (source partagée) et du
module (accès refusé à un non-membre, isolement entre deux guildes), et parcours à deux joueurs
dans le navigateur, où le chef voit la demande arriver sans recharger la page.