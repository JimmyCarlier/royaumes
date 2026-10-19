# Revue de sécurité du parcours d'authentification

- Date : 2026-10-19
- Périmètre : inscription, connexion, déconnexion, sessions, accès à l'API et aux pages du jeu.
- Références : OWASP Top 10, OWASP ASVS.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| S1 | Les mots de passe ne sont conservés que sous forme d'empreinte, par une fonction dédiée | Test « ne conserve qu'une empreinte du mot de passe » ; documentation de Better Auth | | |
| S2 | Les mots de passe comportent au moins 8 caractères | Test « refuse un mot de passe trop court » | | |
| S3 | Les tentatives répétées d'inscription et de connexion sont limitées | Sous-partie 2.3 ; configuration de `better-auth.ts` | | |
| S4 | Le cookie de session est inaccessible au JavaScript de la page | Test sur l'attribut `HttpOnly` | | |
| S5 | Le cookie de session n'est pas envoyé par les requêtes émises depuis un autre site | Test sur l'attribut `SameSite` | | |
| S6 | Le cookie de session ne circule que sur des connexions chiffrées | Inspection du cookie dans le navigateur ; comportement en local et en production | | |
| S7 | Le secret de signature n'est pas versionné, et son absence en production empêche le démarrage | `git grep BETTER_AUTH_SECRET` ; fonction `resolveSecret` | | |
| S8 | La connexion ne révèle pas si une adresse est inscrite | Test « répond de la même manière que l'adresse existe ou non » | | |
| S9 | L'inscription ne révèle pas si une adresse est inscrite | Création d'un compte avec une adresse déjà utilisée | | |
| S10 | Toute route de l'API réservée aux joueurs refuse une requête anonyme | Tests « Contrôle d'accès à l'API du Village » ; racine de composition | | |
| S11 | Un joueur ne peut accéder qu'à ses propres données | Test « isole les villages des joueurs » ; origine de `userId` dans les routes | | |
| S12 | Les pages du jeu sont protégées sur le serveur, avant tout rendu | Mise en page `app/(jeu)/layout.tsx` ; accès à `/village` sans session | | |
| S13 | Les erreurs imprévues ne révèlent aucun détail technique au client | Gestionnaire `onError` de la racine de composition | | |
| S14 | La déconnexion invalide la session sur le serveur | Réutilisation d'un cookie après déconnexion | | |
| S15 | Une requête d'authentification accompagnée d'un cookie et émise depuis une autre origine est refusée | Appel de la déconnexion avec un en-tête `origin` étranger | | |

## Synthèse

Nombre d'exigences conformes, non conformes et en risque accepté ; actions décidées.