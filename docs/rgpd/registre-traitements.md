# Registre des traitements de données personnelles

Ce registre, prévu par l'article 30 du RGPD, recense les traitements de données personnelles
réalisés par Royaumes. Il est tenu à jour à chaque évolution du jeu qui ajoute, modifie ou
supprime une donnée personnelle, dans le même commit que cette évolution.

- Responsable du traitement : NOM, adresse électronique de contact.
- Date de dernière mise à jour : AAAA-MM-JJ.

## Sous-traitants

| Sous-traitant | Rôle | Localisation des données | Garanties à vérifier |
| --- | --- | --- | --- |
| Vercel | Hébergement de l'application, journaux techniques | Région de Francfort (fra1) pour les fonctions | Accord de traitement des données (DPA), transferts hors de l'Union européenne |
| Neon | Hébergement de la base de données | Région de Francfort | Accord de traitement des données (DPA), transferts hors de l'Union européenne |

## Traitements

| N° | Traitement | Finalité | Données | Personnes concernées | Base légale | Durée de conservation | Emplacement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Comptes des joueurs | Permettre l'accès au jeu | Nom, adresse électronique, empreinte du mot de passe, date d'inscription | Joueurs | Exécution du contrat (conditions d'utilisation du jeu) | Jusqu'à la suppression du compte | `identity.user`, `identity.account` |
| T2 | Sessions | Maintenir la connexion ; limiter les tentatives de connexion | Adresse IP, navigateur, dates de la session | Joueurs | Exécution du contrat ; intérêt légitime (sécurité) | Jusqu'à l'expiration de la session, ou la suppression du compte | `identity.session` |
| T3 | Activité de jeu | Faire fonctionner le Village, le Donjon, le Marché et le Classement | Identifiant, nom du joueur, nom du village, actions de jeu | Joueurs | Exécution du contrat | Jusqu'à la suppression du compte ; ensuite, identifiant pseudonymisé et noms remplacés (ADR 0008) | `platform.events`, `platform.outbox`, `ranking`, `dungeon`, `market` |
| T4 | Messagerie de la Taverne | Permettre aux joueurs de discuter | Contenu des messages, auteur, date | Joueurs | Exécution du contrat | Trente jours, ou jusqu'à la suppression du compte | `tavern.messages` |
| T5 | Présence dans la Taverne | Indiquer les joueurs présents | Identifiant, nom, date du dernier signal | Joueurs | Exécution du contrat | Deux minutes après le dernier signal | `tavern.presence` |
| T6 | Registre des effacements | Démontrer la réalisation des effacements | Date de l'effacement, nombre d'événements réécrits ; aucune donnée sur le joueur | Aucune personne identifiable | Obligation légale (responsabilité, article 5) | Illimitée | `platform.erasures` |
| T7 | Journaux techniques | Diagnostiquer les erreurs, assurer la sécurité | Adresse IP, adresses des requêtes, messages d'erreur | Joueurs, visiteurs | Intérêt légitime (sécurité, maintenance) | Durée fixée par l'hébergeur : à vérifier | Vercel |
| T8 | Guildes | Permettre aux joueurs de former des guildes et de les classer | Identifiant, nom du joueur, rôle et date d'arrivée dans sa guilde ; demande d'adhésion (guilde visée, nom, date) ; contribution (or rapporté, nombre d'améliorations, sans nom) | Joueurs | Exécution du contrat | Appartenance : jusqu'au départ de la guilde ou à la suppression du compte. Demande : jusqu'à la décision du chef ; expirée après 72 heures, puis supprimée par la tâche quotidienne. Contribution : jusqu'à la suppression du compte, puis conservée sans nom, comme le Classement | `guild.members`, `guild.requests`, `guild.contributions` |

## Mesures de sécurité propres aux Guildes (T8)

- Routes réservées aux joueurs connectés ; un joueur n'agit qu'en son propre nom
  (revue `docs/qualite/revue-securite-guild.md`, exigences G1 et G2).
- Les noms des demandeurs ne sont présentés qu'au chef de la guilde visée (G8).
- Le canal temps réel d'une guilde est réservé à ses membres et ne transmet aucune donnée
  personnelle ; la table `guild.activity` n'en contient aucune (G9).
- À l'effacement d'un compte, le joueur quitte sa guilde et sa demande est supprimée : son nom
  disparaît des tables du module (G11).
  
## Droits des personnes

| Droit | Mise en œuvre |
| --- | --- |
| Accès et portabilité (articles 15 et 20) | Page « Mes données » : export JSON de toutes les données du joueur |
| Effacement (article 17) | Page « Mes données » : suppression du compte, effective dans tous les modules |
| Rectification (article 16) | Non mis en œuvre : le nom d'un joueur ne peut pas encore être modifié |