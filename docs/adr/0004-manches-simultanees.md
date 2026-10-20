# ADR-0004 - Manches simultanées, aux échéances paresseuses, pour les combats du Donjon

- Statut : accepté
- Date : 2026-10-20

## Contexte

- Un combat réunit jusqu'à quatre joueurs humains. Ils ne doivent ni attendre
  indéfiniment un joueur absent ni être avantagés par l'ordre dans lequel ils
  envoient leur action.
- L'hébergement ne fournit ni minuteur en mémoire ni tâche de fond. Les tâches
  planifiées de l'offre gratuite ne s'exécutent qu'une fois par jour.
- Conformément à l'ADR-0002, l'état d'une expédition est reconstruit en
  rejouant ses événements. Tout calcul de combat doit donc être reproductible
  à partir de cet état et des commandes reçues.
- Les choix des joueurs sont des informations privées jusqu'à la résolution de
  la manche. Une vue ne doit pas révéler le choix d'un autre héros.

## Décision

- Les héros choisissent simultanément leur action. Une manche est résolue dès
  que tous les héros encore debout ont choisi, ou lorsque son échéance de
  trente secondes est atteinte. Un héros debout sans choix reçoit alors
  automatiquement l'action `defend`.
- L'échéance est fixée et enregistrée dans l'événement d'entrée dans une salle
  de monstres, puis dans chaque événement de résolution pour la manche
  suivante. Une manche échue est résolue à l'instant enregistré de son
  échéance, et non à l'instant où elle est finalement traitée.
- Une lecture calcule les résolutions des manches échues pour construire une
  vue à jour, sans rien enregistrer. Une commande commence par calculer les
  échéances échues et, si elle est acceptée, enregistre ces événements avec
  ceux de la commande. La commande d'échéance ne fait qu'offrir ce point
  d'entrée au serveur ; le navigateur l'envoie lorsque son compte à rebours
  atteint zéro.
- Le hasard est tiré dans `decide`, par un générateur déterministe dont la
  graine est dérivée de la graine de l'expédition et du numéro de la manche.
  Les effets et les actions complètes produits par le tirage sont enregistrés
  dans l'événement de résolution ; `evolve` ne tire donc jamais au sort.
- Une action porte le numéro de la manche visée. Elle est refusée si ce numéro
  ne correspond plus à la manche en cours, notamment lorsque celle-ci a été
  résolue entre l'affichage et l'envoi de l'action.
- La vue filtrée indique seulement si chaque héros a choisi et révèle l'action
  au joueur qui l'a soumise. Les autres actions restent masquées jusqu'à la
  résolution.

Cette décision est mise en œuvre principalement dans
[`rules.ts`](../../src/modules/dungeon/domain/rules.ts),
[`game.ts`](../../src/modules/dungeon/domain/game.ts),
[`view.ts`](../../src/modules/dungeon/domain/view.ts) et
[`ui.tsx`](../../src/modules/dungeon/ui.tsx).

## Conséquences

### Positives

- Les joueurs peuvent agir sans attendre un tour individuel ; l'ordre des
  requêtes ne donne donc pas à l'un d'eux un avantage structurel.
- Un joueur absent ne bloque pas le combat au-delà de trente secondes et
  contribue par une défense par défaut.
- La résolution anticipée lorsque tous les héros ont choisi réduit l'attente
  dans les parties complètes.
- Les choix restent secrets jusqu'à la résolution, ce qui évite qu'un joueur
  adapte son action à celle d'un autre.
- Les échéances et les résultats étant dans le journal, une reconstruction de
  l'expédition produit le même état, indépendamment de l'instance qui traite
  la requête.
- Le modèle ne nécessite ni mémoire partagée, ni minuteur serveur, ni tâche
  planifiée fréquente ; il reste compatible avec l'hébergement actuel.
- Le contrôle du numéro de manche empêche qu'une action affichée pour une
  manche précédente soit appliquée à une manche déjà résolue.

### Négatives

- Si plus aucun joueur ne se manifeste après l'échéance, une lecture peut
  afficher une résolution calculée mais non enregistrée dans le journal. Le
  journal et les lectures peuvent donc rester décalés jusqu'à la prochaine
  commande acceptée.
- Le déclenchement de la notification d'échéance dépend d'au moins un
  navigateur ouvert et fonctionnel. Un navigateur fermé, suspendu ou privé de
  réseau ne provoque pas immédiatement la commande `CheckDeadline`.
- Le navigateur doit conserver et afficher un compte à rebours fondé sur
  l'échéance serveur, puis gérer les reconnexions et les courses entre
  commandes concurrentes.
- Une commande peut devoir résoudre plusieurs manches échues avant de traiter
  son intention ; cela augmente la taille de l'écriture et le nombre de
  tentatives nécessaires en cas de conflit optimiste.
- Les choix privés nécessitent une vue filtrée et une discipline stricte :
  exposer l'état complet ou les événements bruts compromettrait la
  simultanéité du choix.
- La graine déterministe rend les résultats reproductibles mais n'est pas un
  mécanisme cryptographique ; elle ne doit pas être utilisée pour un hasard
  exigeant une confidentialité forte.

## Alternatives écartées

- **Tour par tour strict** : rejeté, car un joueur lent ou absent bloquerait
  les autres et l'ordre des tours pourrait avantager certains joueurs.
- **Minuteur serveur en mémoire ou tâche planifiée** : rejeté, car les
  instances de l'hébergement ne partagent pas leur mémoire et la fréquence
  d'exécution disponible ne permet pas une échéance de trente secondes.
- **Lecture qui enregistre elle-même la résolution** : rejeté, car une lecture
  devrait alors écrire, avec des courses entre lecteurs et des effets de bord
  difficiles à rendre fiables. La lecture reste une projection pure ; une
  commande est le point d'entrée de la persistance.
- **Tirage par `Math.random` en n'enregistrant que le résultat** : rejeté, car
  le résultat ne pourrait pas être recalculé de façon indépendante lors d'une
  reprise ou d'un conflit. La graine par manche et les effets enregistrés
  rendent la décision déterministe et vérifiable.
- **Attendre une tâche quotidienne pour traiter les échéances** : rejeté, car
  le délai serait incompatible avec le rythme du combat et ne résoudrait pas
  le besoin d'une notification rapide aux joueurs.

## Réexamen

La décision devra être réexaminée si le métier exige d'enregistrer la fin d'une
expédition abandonnée alors qu'aucun navigateur ne reste ouvert, ou si
l'absence prolongée de tous les joueurs doit produire des événements à une
échéance garantie.

Elle devra également être réévaluée si l'hébergement fournit un service de
planification de tâches fréquent et fiable, ou un mécanisme durable de
déclenchement compatible avec le journal d'événements. Le volume de combats,
la charge des lectures calculant des échéances et les problèmes observés de
reconnexion du navigateur sont aussi des signaux de réexamen.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des
consignes fournies, des ADR existantes et de l'implémentation du module
Donjon. Le contenu a été vérifié dans le code de
[`rules.ts`](../../src/modules/dungeon/domain/rules.ts),
[`game.ts`](../../src/modules/dungeon/domain/game.ts),
[`view.ts`](../../src/modules/dungeon/domain/view.ts) et
[`ui.tsx`](../../src/modules/dungeon/ui.tsx).