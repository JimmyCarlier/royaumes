# Revue de conformité au RGPD

- Date : AAAA-MM-JJ
- Périmètre : données personnelles de l'ensemble du jeu, export et effacement, durées de conservation, journaux techniques.
- Références : RGPD, articles 5, 15, 17, 20, 25 et 30 ; registre des traitements ; ADR 0008.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| R1 | Chaque emplacement de données personnelles figure au registre des traitements | Comparaison du registre et de l'inventaire de la sous-partie 1.2 du TD10 | | |
| R2 | L'export contient toutes les données du joueur, module par module | Test « exporte les données du joueur, module par module, en un fichier JSON » ; lecture d'un export réel | | |
| R3 | L'export ne contient ni les données des autres joueurs, ni les secrets du jeu ou du compte | Test « ne contient ni les données des autres joueurs, ni les secrets du jeu » ; recherche de « password » et « token » dans un export | | |
| R4 | Après la suppression d'un compte, son nom et celui de son village n'apparaissent plus dans aucune table | Suppression d'un compte de test, puis recherche de son nom dans toutes les tables | | |
| R5 | L'effacement est tracé, sans conserver de donnée sur le joueur, et peut être relancé | Tests « enregistre l'effacement dans le registre... » et « peut être relancé sans effet supplémentaire » | | |
| R6 | Les messages de la Taverne ne sont pas conservés plus de trente jours, même sans visite | Tests de la durée de conservation ; compte rendu de la tâche quotidienne dans les journaux de Vercel | | |
| R7 | La présence ne constitue aucun historique des visites | Test « considère comme parti un joueur sans signal depuis deux minutes, et supprime sa ligne » | | |
| R8 | Les sessions expirées ne sont pas conservées indéfiniment | Requête SQL sur `identity.session` : sessions dont `expires_at` est passé | | |
| R9 | Les journaux techniques ne contiennent pas de données personnelles au-delà du nécessaire | Lecture de `app.onError` dans `create-api.ts` ; consultation des journaux de Vercel | | |
| R10 | Après la suppression d'un compte, l'identifiant conservé ne peut plus être relié à une personne | Recherche de l'identifiant dans `identity`, `platform.outbox` et les journaux de Vercel | | |

## Synthèse

Nombre d'exigences conformes, non conformes et en risque accepté ; actions décidées.