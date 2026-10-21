# ADR-0008 - Stockage classique pour la Taverne, et réécriture ciblée du journal pour l'effacement

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le jeu conserve des données directement liées aux comptes : noms de joueurs et de villages,
participations aux expéditions, messages de la Taverne, présence et activité enregistrée
dans le journal. Les joueurs doivent pouvoir consulter leurs données et demander la
suppression de leur compte et de leurs données personnelles.

L'Event Sourcing rend les changements de l'état métier rejouables, mais les événements
historiques peuvent contenir des données personnelles. Supprimer entièrement un flux ou
modifier le sens des événements compromettrait la reconstruction de l'état et des vues
historiques. À l'inverse, supprimer seulement le compte laisserait ces données dans le
journal et dans les tables de lecture.

Les données de la Taverne ont une autre nature : les messages et la présence ont une durée
de vie limitée et ne nécessitent pas de relecture pour reconstruire un état métier.

## Décision

Les données de jeu qui nécessitent un historique sont conservées sous forme d'événements.
La Taverne utilise des tables relationnelles classiques pour les messages et la présence,
qui peuvent être supprimés directement et dont la conservation est limitée.

Chaque module et la plateforme déclarent un contributeur aux droits des joueurs. Celui-ci
exporte les données du joueur sous une forme lisible, désigne les données personnelles de
ses événements à réécrire et efface les données de ses propres tables de lecture. La route
d'export renvoie un fichier JSON ; les routes d'export et d'effacement n'agissent que sur
l'identité authentifiée.

L'effacement procède dans cet ordre :

1. Le journal est parcouru à la recherche des événements dont le flux ou les données
   mentionnent l'identifiant du joueur. Les contributeurs remplacent seulement les champs
   personnels qu'ils reconnaissent. Le type, le flux, la version et les données de
   gameplay nécessaires à la relecture sont conservés.
2. Les événements réécrits et une entrée anonyme du registre des effacements sont validés
   dans une transaction unique.
3. Chaque contributeur efface ou anonymise les données personnelles conservées dans ses
   tables. Les données d'identité sont supprimées en dernier ; les comptes et leurs
   sessions et identifiants associés sont supprimés en cascade.

Les noms de joueurs et de villages sont remplacés par des valeurs neutres. Les identifiants
qui subsistent dans l'historique sont pseudonymisés par la suppression du compte, afin de
préserver les liens nécessaires à la relecture et aux agrégats. Le Classement conserve les
totaux sous un nom neutre ; les messages de la Taverne et la présence sont supprimés. Le
registre des effacements ne conserve ni identifiant ni autre donnée du joueur, seulement
la date et le nombre d'événements réécrits.

Les contributions sont exécutées séquentiellement et sont conçues pour pouvoir être
relancées. L'identité étant effacée en dernier, un joueur peut réauthentifier une demande
si l'effacement a été interrompu avant cette dernière étape.

Cette décision est mise en œuvre dans
[`privacy.ts`](../../src/platform/privacy/privacy.ts), les fichiers
`personal-data.ts` des modules, et
[`privacy-api.ts`](../../src/platform/privacy/privacy-api.ts).

## Conséquences

### Positives

- Le joueur peut obtenir un export de ses données et demander leur effacement depuis les
  surfaces prévues à cet effet.
- Chaque module connaît et traite ses propres données personnelles ; la plateforme
  orchestre les contributeurs sans dépendre des détails métier de chaque module.
- L'effacement ne détruit pas tout l'historique : les événements et informations de
  gameplay nécessaires à la reconstruction sont conservés tandis que les noms sont
  remplacés.
- Les écritures du journal et du registre anonyme sont atomiques ; le registre atteste
  qu'un effacement a eu lieu sans conserver l'identité effacée.
- L'effacement des tables de lecture, des messages, de la présence et du compte complète
  le traitement des données copiées en dehors du journal.
- Le stockage relationnel de la Taverne rend possible la suppression et la purge des
  messages et de la présence sans devoir concevoir des événements de suppression.

### Négatives

- La réécriture ciblée est une exception à l'immutabilité stricte du journal : les données
  d'événements déjà enregistrés peuvent être modifiées dans le seul cadre de l'effacement.
- Chaque évolution d'un format d'événement doit être répercutée dans les fonctions de
  réécriture des contributeurs, faute de quoi une donnée personnelle pourrait subsister.
- L'effacement peut porter sur de nombreux événements et plusieurs tables ; il ajoute une
  charge proportionnelle à l'historique concerné et n'est pas réalisé dans une transaction
  unique couvrant tous les modules.
- Une interruption après la réécriture du journal mais avant la fin des suppressions laisse
  temporairement des données dans certaines tables, même si une nouvelle demande peut
  reprendre le traitement.
- Les identifiants encore présents dans les événements restent des données pseudonymisées,
  pas des données anonymes tant qu'ils peuvent être reliés à une autre information.
- L'export et l'effacement dépendent de la bonne déclaration et du maintien à jour de tous
  les contributeurs, y compris ceux ajoutés ultérieurement.
- Une évolution juridique ou une analyse de risque peut conduire à revoir la durée de
  conservation, la nature des champs réécrits et les justificatifs à garder.

## Alternatives écartées

- **Supprimer uniquement le compte d'identité** : rejeté, car des données personnelles
  resteraient dans le journal, les projections et les tables des modules.
- **Supprimer intégralement les flux du joueur** : rejeté, car certains flux contiennent
  les faits nécessaires au calcul de l'état du Village ou à la compréhension des
  opérations historiques.
- **Conserver tous les événements inchangés et ne masquer les données qu'à l'affichage** :
  rejeté, car les données resteraient présentes et accessibles dans les systèmes de
  stockage et les exports d'exploitation.
- **Remplacer tous les événements par un événement d'effacement global** : rejeté, car
  cette approche détruirait les informations historiques encore nécessaires aux règles de
  jeu et aux projections.
- **Utiliser l'Event Sourcing pour les messages et la présence de la Taverne** : rejeté,
  car ces données temporaires n'ont pas besoin d'être rejouées et doivent pouvoir être
  purgées simplement.

## Réexamen

Cette décision devra être réexaminée si un nouveau module conserve des données personnelles
sans contribuer aux exports et effacements, si une reconstruction après effacement
réintroduit des noms ou si les exigences de conservation ne sont plus satisfaites.

Elle devra également être réévaluée si les volumes rendent l'effacement trop long, si les
identifiants pseudonymisés ne peuvent plus être justifiés, ou si une évolution du cadre
applicable impose une autre stratégie de conservation ou de preuve.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des ADR
précédentes, du service de confidentialité, des contributeurs de modules et du registre
RGPD. Le contenu a été vérifié dans
[`privacy.ts`](../../src/platform/privacy/privacy.ts), les fichiers
`personal-data.ts` des modules,
[`create-api.ts`](../../src/bootstrap/create-api.ts) et
[`registre-traitements.md`](../rgpd/registre-traitements.md).
