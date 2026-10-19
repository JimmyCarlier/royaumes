# ADR-0002 - l'Event Sourcing comme mode de persistance du Village.

- Statut : accepté
- Date : 2026-10-19

## Contexte

- La nature des données du Village : un état qui évolue par des actions successives du joueur.
- Les besoins annoncés pour la suite du projet : diffusion des changements en temps réel (TD5), construction de vues de lecture à partir de l'activité des joueurs (TD8).
- La contrainte de l'hébergement : plusieurs instances de l'application peuvent traiter simultanément des requêtes pour un même village.

## Décision

- L'état du village n'est pas stocké : il est reconstruit en rejouant ses événements.
- Les événements sont enregistrés dans un journal générique de la plateforme (`platform.events`), un flux par village, nommé `village-<joueur>`.

- Les écritures concurrentes sont détectées par la contrainte d'unicité sur le flux et la version, et la commande est rejouée au plus trois fois.
- Un événement porte toutes les informations nécessaires à son application, comme le coût payé pour une amélioration.

## Conséquences

### Positives

Au moins trois, parmi celles présentées en 1.1 et 1.3.

### Négatives

Au moins trois, dont l'impossibilité de modifier un événement enregistré et ce qu'elle implique pour l'évolution de leur structure.

## Alternatives écartées

Au moins deux, avec la raison de leur rejet. Pensez au stockage de l'état dans une table propre au module, et au verrouillage pessimiste.

## Réexamen

Au moins deux, avec la raison de leur rejet. Pensez au stockage de l'état dans une table propre au module, et au verrouillage pessimiste.


## Usage de l'IA générative

Un ADR décrit la décision et ses raisons, non son implémentation : il ne reprend pas le code du journal, mais peut renvoyer aux fichiers qui la mettent en œuvre.