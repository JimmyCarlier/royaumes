# ADR-0007 - Saga orchestrée et boîte d'envoi transactionnelle pour les opérations entre modules

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le Marché permet à un joueur de publier une offre en mettant des ressources en réserve dans
son Village, puis à un autre joueur de l'accepter en transférant les ressources convenues.
Le Marché et le Village sont des modules distincts. Leurs opérations peuvent toucher des
états conservés dans des flux différents et ne peuvent pas être validées dans une
transaction métier unique lorsqu'ils sont séparés.

Une opération peut être interrompue après une étape réussie : par exemple, les ressources
du vendeur peuvent avoir été réservées alors que la suite de l'échange n'a pas encore été
traitée. L'hébergement ne garantit ni processus permanent ni mémoire partagée. Il faut donc
que les demandes à transmettre survivent à l'instance qui les a produites et puissent être
retentées.

## Décision

Les opérations du Marché qui impliquent le Village sont modélisées comme une saga orchestrée
par les événements de l'offre. Le domaine du Marché détermine les demandes à émettre après
chaque événement ; le service applicatif les convertit en messages adressés au module
concerné.

Les événements d'une commande et les messages qu'ils produisent sont enregistrés dans la
même transaction de base de données. Un message ne peut donc pas être perdu entre
l'enregistrement de la décision métier et l'enregistrement de son effet à transmettre.

La plateforme conserve les messages dans une boîte d'envoi durable. Le distributeur réserve
les messages disponibles avec un bail, remet chaque message au gestionnaire associé à son
sujet et marque le message comme traité après succès. Une interruption avant cette
confirmation peut entraîner une nouvelle remise : la livraison est au moins une fois et
les gestionnaires doivent supporter les doublons. Les erreurs sont retentées avec un délai
crescent, plafonné à une heure ; après dix tentatives par défaut, le message est laissé en
lettre morte pour examen et peut être relancé après correction.

La distribution est déclenchée après les commandes et les consultations du Marché, et par
la tâche planifiée quotidienne. Des messages différés servent notamment à demander le
retrait d'une offre arrivée à échéance. Les modules enregistrent leurs gestionnaires par
sujet auprès du distributeur commun, sans que celui-ci dépende de leurs règles métier.

La saga de l'offre suit les étapes de réservation des ressources du vendeur, ouverture de
l'offre, prélèvement du paiement de l'acheteur, livraison aux deux joueurs et, en cas
d'annulation, restitution des ressources réservées. Cette décision est mise en œuvre
notamment dans
[`saga.ts`](../../src/modules/market/domain/saga.ts),
[`market-service.ts`](../../src/modules/market/application/market-service.ts) et
[`outbox.ts`](../../src/platform/outbox/outbox.ts).

## Conséquences

### Positives

- Les demandes à transmettre survivent à la fin d'une requête ou à l'arrêt d'une instance.
- L'écriture atomique de l'événement et de ses messages évite qu'une transition durable de
  la saga ne perde le travail qu'elle doit déclencher.
- Les étapes de l'opération sont explicites dans l'état et les événements de l'offre ; une
  opération interrompue peut reprendre à partir des messages encore en attente.
- Les règles de transfert restent dans les modules concernés : le Marché orchestre son
  échange et le Village reste responsable de ses ressources.
- Les tentatives répétées et les lettres mortes rendent les échecs observables et
  permettent une reprise après correction du problème.
- Les messages différés permettent de traiter les échéances sans minuteur conservé en
  mémoire par un processus permanent.

### Négatives

- Une saga n'est pas atomique au niveau métier : ses étapes peuvent être visibles à des
  moments différents, et une compensation est nécessaire lorsque l'opération doit être
  annulée après une étape réussie.
- La livraison au moins une fois impose que les gestionnaires soient idempotents. Une
  interruption après le traitement mais avant la confirmation peut produire un doublon.
- Une panne du distributeur ou des gestionnaires retarde la progression ; une tâche
  quotidienne seule ne garantit pas une reprise rapide.
- Une lettre morte interrompt la progression automatique. Elle nécessite une surveillance,
  un diagnostic et une relance explicite.
- Les messages et leurs erreurs sont conservés dans la base ; leur durée de conservation
  et leur éventuelle présence de données personnelles doivent être prises en compte.
- Lorsque les modules sont exécutés dans des processus différents, la transmission HTTP,
  l'authentification de service et les boîtes de réception augmentent les points de
  défaillance.

## Alternatives écartées

- **Appeler directement le Village depuis le domaine ou le stockage du Marché** : rejeté,
  car cela ferait dépendre un module de l'implémentation interne d'un autre et ne
  survivrait pas à une interruption entre deux appels.
- **Enregistrer l'événement puis envoyer immédiatement un message non durable** : rejeté,
  car le processus pourrait s'arrêter après l'écriture de l'événement et avant l'envoi.
- **Placer l'événement et le message dans des transactions séparées** : rejeté, car l'une
  pourrait réussir sans l'autre, laissant une saga impossible à reprendre fidèlement.
- **Une transaction distribuée entre tous les modules** : rejetée, car elle supposerait
  une coordination synchrone et une transaction partagée, incompatibles avec l'extraction
  d'un module en service autonome.
- **Une file conservée en mémoire** : rejetée, car elle serait perdue au redémarrage et ne
  serait pas partagée entre plusieurs instances.

## Réexamen

Cette décision devra être réexaminée si la fréquence des lettres mortes ou le délai de
progression des sagas devient incompatible avec le service attendu, ou si la tâche
planifiée actuelle ne suffit plus à distribuer les messages à temps.

Elle devra également être réévaluée si plusieurs consommateurs doivent partager un sujet,
si les volumes rendent nécessaire un courtier de messages dédié, ou si le protocole de
reprise et d'idempotence des services extraits évolue.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des ADR
précédentes et de l'implémentation du Marché et de la boîte d'envoi. Le contenu a été
vérifié dans
[`saga.ts`](../../src/modules/market/domain/saga.ts),
[`event-store-offer-repository.ts`](../../src/modules/market/infrastructure/event-store-offer-repository.ts)
et [`outbox.ts`](../../src/platform/outbox/outbox.ts).
