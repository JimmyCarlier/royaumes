# ADR-0005 - Intelligence artificielle déterministe, exécutée dans le domaine, sans tâche de fond

- Statut : accepté
- Date : 2026-10-20

## Contexte

Le Donjon doit proposer des monstres dont le comportement varie selon un niveau de
difficulté, ainsi que des compagnons permettant de jouer seul.

L'hébergement ne permet aucun processus permanent ni tâche de fond fiable
(ADR-0004). L'état d'une expédition est reconstruit à partir de ses événements
(ADR-0002), et une manche échue peut être calculée lors d'une lecture sans être
enregistrée.

Les décisions de l'intelligence artificielle doivent donc rester compatibles avec
une résolution déclenchée par une commande ou par une lecture, être
reproductibles entre plusieurs instances et ne pas dépendre d'un état conservé
en mémoire.

## Décision

- Les décisions de l'intelligence artificielle sont des fonctions pures du
  domaine, appelées au moment de la résolution d'une manche.
- Elles tirent au sort uniquement au moyen du générateur fourni par la manche.
  Elles ne dépendent ni de l'heure courante, ni de `Math.random`, ni d'un état
  mutable partagé.
- Les résultats de ces décisions, y compris les actions des compagnons, sont
  enregistrés dans l'événement `RoundResolved`. La relecture des événements
  n'exécute donc pas à nouveau l'intelligence artificielle.
- Le comportement des monstres est isolé derrière un port de stratégie.
  Chaque niveau de difficulté fournit une mise en œuvre de ce port.
- Un compagnon n'agit que si au moins un joueur a choisi une action pour la
  manche.
- L'équilibre du jeu est mesuré par simulation et protégé par des tests
  statistiques.

## Conséquences

### Positives

- Les mêmes événements produisent le même état, quelle que soit l'instance qui
  résout ou relit l'expédition.
- La résolution fonctionne sans processus permanent, minuteur serveur ou état
  partagé, ce qui respecte les contraintes d'hébergement.
- Les décisions enregistrées dans `RoundResolved` rendent la relecture rapide et
  évitent de recalculer l'intelligence artificielle à chaque lecture.
- Le port de stratégie permet de faire évoluer chaque niveau de difficulté sans
  mélanger les règles des monstres avec le reste de la résolution d'une manche.
- Les compagnons permettent à un joueur seul de bénéficier d'actions alliées,
  tout en restant soumis à la résolution simultanée des manches.
- Les simulations et les tests statistiques donnent un moyen mesurable de
  détecter une difficulté ou une composition de groupe déséquilibrée.

### Négatives

- Un personnage piloté par l'ordinateur ne peut pas agir entre deux échéances :
  son action n'est produite qu'au moment où une manche est résolue.
- La qualité de l'équilibre dépend de la règle suivie par les joueurs simulés ;
  une simulation qui modélise mal leurs choix peut donner des conclusions
  trompeuses.
- Enregistrer les décisions augmente la taille des événements
  `RoundResolved` et rend leur structure durable dans le journal.
- Toute modification d'une stratégie peut changer le comportement des nouvelles
  manches sans pouvoir modifier les décisions déjà enregistrées.
- Les tests statistiques peuvent être sensibles à la graine, au nombre de
  parties simulées et aux seuils choisis ; ils ne constituent pas une preuve
  exhaustive de l'équilibre.

## Alternatives écartées

- **Boucle de jeu exécutée par un processus permanent** : rejetée, car
  l'hébergement ne garantit aucun processus permanent et le modèle serait
  dépendant d'une mémoire ou d'un état durable extérieur au journal.
- **Décisions prises par le navigateur d'un joueur** : rejetées, car elles
  seraient contrôlables par le client, difficiles à rendre cohérentes entre les
  joueurs et incompatibles avec une résolution déclenchée par une lecture.
- **Recalculer les décisions lors de la relecture plutôt que les enregistrer** :
  rejeté, car une lecture pourrait produire un résultat différent d'une autre
  lecture et l'évolution d'une stratégie changerait rétroactivement les
  expéditions déjà jouées.
- **Utiliser un tirage global ou non déterministe** : rejeté, car le résultat
  ne serait pas reproductible entre les résolutions et les relectures.

## Réexamen

La décision devra être réexaminée si le jeu exige qu'un personnage piloté par
l'ordinateur agisse en temps réel, entre deux échéances de manche, ou si des
réactions immédiates à des événements externes deviennent nécessaires.

Elle devra également être réévaluée si une stratégie devient trop coûteuse en
calcul pour être exécutée lors d'une lecture, si le volume des événements
`RoundResolved` devient problématique ou si l'hébergement fournit un mécanisme
fiable d'exécution durable. Les résultats des simulations et des tests
statistiques devront aussi déclencher un réexamen si l'équilibre attendu n'est
plus atteint malgré une modélisation représentative des joueurs.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des
consignes fournies et des ADR existantes. Le contenu a été relu pour vérifier
la couverture des contraintes de l'ADR-0002, des manches de l'ADR-0004 et des
exigences relatives aux stratégies, aux compagnons et à la reproductibilité.