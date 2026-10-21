# ADR-0006 - CQRS : modèles de lecture tenus par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le journal d'événements est adapté à la reconstruction de l'état métier, mais certaines
lectures portent sur plusieurs flux ou nécessitent une liste filtrée et triée. Rejouer
l'ensemble de l'historique à chaque consultation ferait croître leur coût avec le volume
total des événements.

Le Donjon doit notamment afficher les expéditions ouvertes sans parcourir tous les combats
terminés. Le Classement agrège les participations et les résultats de plusieurs expéditions
et villages. Le Marché doit afficher les offres encore disponibles. Ces lectures ne
constituent pas la source de vérité : les événements restent la référence pour les domaines
qui les utilisent.

L'application peut traiter plusieurs requêtes simultanément sur plusieurs instances. Une
projection doit donc pouvoir reprendre son travail de manière cohérente et ne pas dépendre
d'un état conservé en mémoire.

## Décision

Les lectures qui nécessitent un modèle optimisé utilisent des projections persistées dans
des tables relationnelles. Le journal reste la source de vérité ; les tables de projection
sont des modèles de lecture reconstruisibles.

Chaque projection déclare un nom unique, une version, les types d'événements qu'elle traite,
une fonction qui applique un événement et une fonction qui vide ses tables pour permettre
leur reconstruction. La plateforme conserve, pour chaque projection, sa position de reprise
dans l'ordre global du journal et la version de code qui a construit ses tables.

Le moteur de projection avance par lots, en ordre de position. Les événements non concernés
sont ignorés par la projection, mais leur position est tout de même prise en compte. Les
changements apportés aux tables et au point de reprise sont validés dans la même transaction.
Un verrou sur le point de reprise empêche deux rattrapages concurrents de la même projection.
Les trous récents dans les positions sont attendus pendant cinq secondes avant que le moteur
ne poursuive, afin de ne pas dépasser une insertion encore en cours.

Une lecture demande le rattrapage de sa projection avant de consulter les tables. Si la
projection est déjà à jour, le moteur évite la transaction et le verrou. Si sa version a
changé, ses tables sont vidées et reconstruites depuis le journal. Une version de projection
plus récente que celle du code exécuté n'est pas modifiée par un processus ancien.

Cette approche est utilisée notamment pour le classement, les expéditions ouvertes et les
offres du Marché. Elle est mise en œuvre dans
[`projection.ts`](../../src/platform/projection/projection.ts) et dans les projections des
modules concernés.

## Conséquences

### Positives

- Les consultations de listes et d'agrégats ne doivent pas rejouer tout l'historique de
  chaque domaine ; elles lisent des tables adaptées à leurs besoins.
- Le journal demeure la source de vérité et permet de reconstruire les modèles de lecture
  après une erreur ou une évolution de leur structure.
- Le point de reprise et les écritures de projection étant atomiques, un événement n'est
  pas marqué comme traité si la mise à jour de ses tables échoue.
- Le verrouillage du point de reprise évite que deux requêtes appliquent simultanément les
  mêmes événements à une projection.
- Le chemin rapide d'une projection déjà à jour évite une transaction et un verrou sur les
  consultations habituelles.
- La version explicite permet de reconstruire les tables lorsqu'une modification change
  leur contenu ou leur règle de calcul.

### Négatives

- Une projection peut être en retard entre l'écriture d'un événement et sa prochaine
  lecture ; son rattrapage ajoute alors de la latence à cette première consultation.
- Une reconstruction peut lire une grande partie du journal et verrouille le point de
  reprise pendant son exécution ; une projection volumineuse peut donc augmenter la charge
  de la base ou ralentir les lecteurs concurrents.
- Chaque projection et chaque changement de sa structure exigent une maintenance de
  version et une fonction de reconstruction correcte.
- La plateforme doit parcourir les positions globales, y compris celles des événements
  ignorés par une projection, afin de détecter les trous dans le journal.
- Le délai d'attente des positions manquantes équilibre la tolérance aux insertions en
  cours et la progression ; un trou durable n'est pas corrigé par la projection.
- Le modèle de lecture n'est pas une copie immédiatement cohérente de l'écriture. Les
  usages qui exigent une lecture après écriture immédiate doivent le prendre en compte.

## Alternatives écartées

- **Rejouer le journal à chaque lecture** : rejeté pour les listes et agrégats dont le coût
  augmenterait avec tout l'historique, y compris les données sans rapport avec la requête.
- **Faire du modèle relationnel la source de vérité** : rejeté pour les domaines persistés
  par événements, car cela dupliquerait l'état métier et rendrait plus difficile la
  reconstruction déterministe déjà utilisée par ces domaines.
- **Mettre à jour les tables de lecture directement dans les commandes** : rejeté, car
  chaque commande devrait connaître toutes les vues affectées et maintenir leurs
  invariants ; les projections permettent de reconstruire ces vues à partir des faits
  enregistrés.
- **Rattraper les projections par une tâche de fond permanente** : rejeté, car le mode
  d'hébergement visé ne garantit pas de processus durable. Le rattrapage à la lecture
  fonctionne sans infrastructure de traitement permanente.

## Réexamen

Cette décision devra être réexaminée si le rattrapage à la lecture devient une source
mesurable de latence, si les reconstructions prennent trop de ressources, ou si la
fraîcheur requise par un écran ne peut plus tolérer un modèle de lecture éventuellement en
retard.

Elle devra également être réévaluée si le volume du journal justifie un traitement
asynchrone dédié ou si plusieurs projections ont besoin d'un mécanisme de reprise différent
de la position globale actuelle.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des ADR
précédentes et de l'implémentation du moteur de projections et de ses consommateurs. Le
contenu a été vérifié dans
[`projection.ts`](../../src/platform/projection/projection.ts) et dans les projections du
Classement, du Donjon et du Marché.
