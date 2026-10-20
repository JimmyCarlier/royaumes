# ADR-0003 - Server-Sent Events alimentés par le journal d'événements pour la diffusion en temps réel

- Statut : accepté
- Date : 2026-10-19

## Contexte

Les joueurs doivent être informés des changements sans recharger la page. Le premier besoin
concerne la synchronisation entre les onglets ouverts par un même joueur, puis la
synchronisation entre les participants d'une partie du Donjon (TD6).

Les actions des joueurs passent déjà par l'API, au moyen de requêtes HTTP authentifiées.
L'hébergement impose toutefois plusieurs contraintes : la durée d'exécution d'une fonction
Vercel est plafonnée, plusieurs instances peuvent traiter les requêtes sans partager leur
mémoire, et l'offre gratuite ne fournit pas d'infrastructure supplémentaire.

Le projet dispose déjà d'un journal d'événements. Conformément à l'ADR-0002, chaque flux du
journal porte des versions croissantes, ce qui permet de repérer les événements apparus
depuis une lecture précédente.

Cette décision est déjà mise en œuvre par la plateforme temps réel
(`src/platform/realtime/`) et utilisée par l'interface du Village. Elle s'appuie sur le
journal générique `platform.events`, plutôt que sur une mémoire locale à une instance. Elle
pourra être étendue au Donjon lorsque ce module sera développé.

## Décision

Les changements sont diffusés au moyen de Server-Sent Events (SSE), sur la route
`/api/stream/<canal>`.

Un canal correspond exactement à un flux du journal d'événements. L'identifiant de chaque
message SSE est la version de l'événement dans ce flux ; un navigateur peut ainsi reprendre
la lecture après une reconnexion en envoyant l'en-tête `Last-Event-ID`.

Le flux relit le journal toutes les demi-secondes afin de détecter les nouveaux événements.
Il se ferme automatiquement au bout de 240 secondes, puis le navigateur s'y reconnecte. Cette
limite tient compte de la durée d'exécution des fonctions Vercel sans nécessiter de tâche de
fond.

L'accès au flux est réservé aux joueurs connectés. Chaque module déclare la règle d'accès à
ses canaux, et un canal qu'aucune règle ne couvre est refusé.

L'interface relit sa vue à chaque notification reçue, plutôt que d'appliquer elle-même le
contenu des événements. La reconstruction de la vue reste ainsi centralisée dans le module
concerné.

La plateforme fournit également une route de repli
`/api/stream/<canal>/events?after=<version>`, qui renvoie les événements postérieurs à une
version sans connexion SSE. Elle est protégée par les mêmes règles d'accès que le flux.

Dans le module Village, le canal est `village-<joueur>` et la règle autorise uniquement le
joueur concerné. Le hook `useChannel` ouvre la connexion depuis le navigateur et appelle la
relecture de la vue à chaque événement reçu.

## Conséquences

### Positives

- Les changements sont reçus sans rechargement de la page, aussi bien entre les onglets d'un
  joueur qu'entre les participants d'une partie.
- SSE s'appuie sur HTTP et convient donc au mode d'exécution de l'application, sans serveur
  persistant ni mémoire partagée entre instances.
- L'identifiant de message fondé sur la version du journal permet de reprendre un flux après
  une reconnexion sans perdre les événements déjà enregistrés.
- La même solution peut être utilisée par plusieurs modules, tout en laissant à chacun la
  responsabilité de définir les droits d'accès à ses canaux.
- La lecture de la vue après chaque notification évite de dupliquer dans le navigateur la
  logique métier de traitement des événements.
- La route de repli permet de réutiliser la lecture versionnée du journal lorsqu'une diffusion
  progressive n'est pas disponible.

### Négatives

- Chaque joueur connecté provoque une lecture du journal toutes les 500 millisecondes pour
  chacun de ses flux ouverts ; la charge de lecture augmente donc avec le nombre de joueurs
  et de canaux.
- Un événement peut attendre jusqu'à une demi-seconde avant d'être détecté, puis subir le
  délai de traitement et de relecture de la vue : la réception n'est pas instantanée.
- Une connexion SSE consomme une exécution Vercel jusqu'à sa fermeture au bout de 240 secondes
  et dépend de la capacité du navigateur à se reconnecter correctement.
- Une notification ne contient pas nécessairement la vue à jour : l'interface doit effectuer
  une nouvelle lecture, ce qui ajoute des requêtes et peut exposer temporairement une vue
  intermédiaire si plusieurs événements arrivent rapidement.
- Le maintien d'une route de repli ajoute une surface d'API et impose de conserver les mêmes
  règles d'autorisation que pour le flux SSE.
- La reprise par `Last-Event-ID` suppose que les versions du flux restent disponibles dans le
  journal ; une rétention ou une modification de l'historique devra être traitée explicitement.

## Alternatives écartées

- **WebSocket** : cette solution fournirait une communication persistante et bidirectionnelle,
  mais elle est moins adaptée aux fonctions Vercel à durée limitée et aux instances multiples
  sans état partagé. Le besoin actuel est principalement une diffusion du serveur vers le
  navigateur, pas une nouvelle voie de réception des actions.
- **Interrogation périodique par le navigateur** : chaque onglet devrait envoyer
  régulièrement des requêtes HTTP, même lorsqu'aucun changement n'est intervenu. Cela
  multiplierait les requêtes, ne synchroniserait pas naturellement les participants et
  obligerait à choisir entre charge inutile et délai de rafraîchissement.
- **Mécanisme de notification partagé entre instances, comme `LISTEN/NOTIFY` de PostgreSQL
  ou un service de messagerie** : ces solutions réduiraient les lectures répétées du journal,
  mais nécessiteraient une infrastructure et une gestion de connexions partagées
  supplémentaires, incompatibles avec l'offre gratuite actuelle. Elles ne remplacent pas
  non plus la lecture versionnée du journal nécessaire à la reprise.

## Réexamen

Cette décision devra être réexaminée si le nombre de joueurs connectés simultanément devient
tel que les lectures périodiques du journal pèsent significativement sur la base, ou si le
délai maximal de réception d'un événement ne convient plus au gameplay.

Elle devra également être réévaluée si le navigateur doit communiquer au serveur avec un très
faible délai en dehors des requêtes HTTP authentifiées, ou si l'hébergeur fournit une prise en
charge stable des WebSocket et une infrastructure de notification partagée à un coût
compatible avec le projet.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger le contenu à partir des consignes du
cours et des ADR existantes. Le résultat a été relu afin de vérifier sa cohérence avec
l'ADR-0001, l'ADR-0002 et les contraintes d'hébergement du projet.