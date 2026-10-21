# ADR-0009 - Extraction du Village en service autonome, préparée mais non déployée

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le Village est un module métier du monolithe modulaire défini par l'ADR-0001. Son API,
ses gestionnaires de messages, ses données personnelles et sa persistance sont déjà isolés
derrière les entrées publiques du module. Les opérations du Marché peuvent également
solliciter le Village par des messages de saga (ADR-0007).

Une extraction du module doit préserver les contrats utilisés par le reste de l'application :
les routes du Village, ses messages, le flux d'événements consommé par le Classement et les
notifications temps réel. Le service extrait ne partage pas la mémoire du processus Next.js.
Sa disponibilité, son stockage et ses échanges avec l'application doivent donc être traités
explicitement.

Le dépôt contient une implémentation permettant d'exécuter le service Village dans un
processus distinct. L'extraction reste cependant préparée et testable localement : elle
n'est pas déployée en production. Des travaux d'exploitation restent ouverts, notamment la
gestion de ses migrations, la pagination de son flux d'événements et la distribution
autonome de sa boîte d'envoi.

## Décision

Le Village peut être exécuté soit dans le processus principal, soit dans un service séparé,
choisi par configuration. Le mode intégré reste le mode par défaut ; le service séparé n'est
activé que lorsqu'une adresse et un secret de service sont fournis.

Le service autonome réutilise le module Village et sa plateforme technique, avec son propre
journal et sa propre boîte d'envoi. Il n'accepte que les appels authentifiés par le secret
de service. Pour une commande destinée au Village, l'application principale transmet au
service l'identité du joueur déjà authentifié ; le client du jeu ne reçoit aucun accès
direct au service.

Dans l'application, un adaptateur distant présente les mêmes responsabilités que le module
Village intégré : il relaie les requêtes HTTP, transmet les messages du Marché, expose les
règles d'accès aux canaux et aux données personnelles, puis relaie vers le journal local les
événements publiés par le service. Le relais conserve les flux et versions d'origine et
maintient un point de reprise. Le Classement et la diffusion temps réel peuvent ainsi
continuer à lire les copies du journal de l'application sans dépendre directement de la
base du service.

Les échanges de saga restent durables : les messages sont conservés dans la boîte d'envoi
de leur émetteur et ne sont considérés comme remis qu'après le succès du traitement par le
destinataire. Le service transmet à l'application les réponses destinées aux autres
modules par sa propre boîte d'envoi.

Cette décision est préparée dans
[`create-api.ts`](../../src/bootstrap/create-api.ts),
[`remote.ts`](../../src/modules/realm/remote.ts) et
[`village-service.ts`](../../src/services/village/village-service.ts). Le lancement local
est fourni par [`village-service.ts`](../../scripts/village-service.ts).

## Conséquences

### Positives

- L'application peut basculer vers un service séparé sans modifier les routes client du
  Village ni les principaux consommateurs de son flux d'événements.
- Le module métier reste réutilisé dans les deux modes ; l'extraction ne nécessite pas de
  dupliquer ses règles de domaine.
- L'identité du joueur est résolue par l'application principale avant l'appel du service,
  et les échanges entre processus sont protégés par une authentification de service.
- Le journal relayé permet aux projections du Classement et au temps réel de continuer à
  utiliser l'infrastructure centrale pendant la préparation de l'extraction.
- Les messages de la saga du Marché peuvent être acheminés vers le service au moyen des
  boîtes d'envoi et de réception plutôt que par un appel métier direct.
- Le mode intégré reste disponible, ce qui permet de comparer et tester le fonctionnement
  sans rendre obligatoire une infrastructure distribuée.

### Négatives

- Le mode distant ajoute des appels réseau et des défaillances possibles : l'indisponibilité
  ou la latence du service Village affecte les opérations qui en dépendent.
- Le relais rend les événements visibles localement après leur production distante ; le
  journal local et les projections peuvent donc temporairement être en retard.
- Les événements doivent être relayés sans doublon et dans l'ordre utile. La reprise,
  l'idempotence et la gestion des positions manquantes sont des responsabilités
  supplémentaires.
- L'application et le service doivent partager et faire tourner correctement leur secret
  de service, et les deux environnements doivent être configurés de manière cohérente.
- L'extraction introduit une seconde base et un nouveau cycle d'exploitation : migrations,
  sauvegardes, supervision et procédures de reprise doivent être définies.
- Des limites restent ouvertes avant un usage en production : la base de service ne dispose
  pas encore d'une procédure de migration dédiée, le flux publié n'est pas paginé, et la
  boîte d'envoi du service n'est distribuée qu'à la réception d'un message.
- L'application doit conserver des mécanismes de relais et des copies locales tant que
  d'autres modules dépendent du journal central.

## Alternatives écartées

- **Conserver le Village dans le processus principal sans préparer d'adaptateur distant** :
  rejeté, car une extraction ultérieure devrait modifier les consommateurs et les contrats
  en même temps que le déploiement.
- **Déployer immédiatement le Village comme microservice** : rejeté, car les procédures de
  migration, de pagination, de supervision et de distribution autonome ne sont pas encore
  prêtes ; le besoin de déploiement indépendant n'est pas établi.
- **Faire appeler directement le service par le navigateur** : rejeté, car cela exposerait
  le service, son authentification et les détails du contrat interne au client, et
  compliquerait le contrôle de l'identité du joueur.
- **Remplacer immédiatement le journal central par le seul journal du service** : rejeté,
  car le Classement, le temps réel et les mécanismes de reprise consomment encore le journal
  de l'application principale.
- **Dupliquer les règles métier du Village dans le service** : rejeté, car les deux modes
  pourraient diverger et l'extraction ne serait plus réversible par simple configuration.

## Réexamen

Le déploiement autonome devra être réexaminé lorsqu'un besoin concret de capacité, de
déploiement ou d'isolation justifiera le coût opérationnel supplémentaire. Avant une mise en
production, il faudra définir et tester une procédure de migration dédiée à la base du
service, la pagination et la reprise du flux publié, ainsi que la distribution régulière
de sa boîte d'envoi même en l'absence de messages entrants.

La décision devra aussi être réévaluée si le volume du relais, les délais de propagation,
les pannes réseau ou la gestion des secrets deviennent incompatibles avec les besoins du
jeu, ou si les autres consommateurs peuvent lire directement les contrats publiés du
service sans dépendre d'une copie locale.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des ADR
précédentes, du module Village distant et du registre de dette technique. Le contenu a été
vérifié dans
[`remote.ts`](../../src/modules/realm/remote.ts),
[`village-service.ts`](../../src/services/village/village-service.ts),
[`create-api.ts`](../../src/bootstrap/create-api.ts) et
[`dette-technique.md`](../qualite/dette-technique.md).
