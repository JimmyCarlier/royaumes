# Revue de sécurité des Guildes : contrôle d'accès et intégrité des adhésions

- Date : 2026-10-23
- Auteur : Jimmy Carlier
- Périmètre : API du module Guildes (`src/modules/guild/api.ts`), service et adaptateur de
  stockage, canal temps réel `guild-<identifiant>`, tâche quotidienne, contributeur de données
  personnelles, écran `ui.tsx`.
- Références : OWASP Top 10 (A01 Broken Access Control, A03 Injection, A04 Insecure Design).

Les tests cités se trouvent dans `src/bootstrap/guild-api.test.ts`, sauf mention contraire.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| G1 | Toutes les routes du module sont réservées aux joueurs connectés | Test « refuse toute requête anonyme (401) » ; lecture de `create-api.ts` : `app.use('/guild/*', requireUser(auth))` | Les quatre routes testées répondent 401 sans session ; l'intergiciel couvre tout le préfixe `/guild` | Conforme |
| G2 | Un joueur n'agit qu'en son propre nom : aucune route n'accepte d'identifiant désignant l'auteur de l'action | Lecture de `api.ts` : l'auteur est toujours `c.var.userId` ; le seul identifiant de joueur accepté (`/members/:playerId/kick`) désigne la cible | Aucune route ne permet de fonder, demander, accepter, quitter ou exclure au nom d'un autre joueur | Conforme |
| G3 | Seul le chef d'une guilde accepte ou refuse une demande qui lui est adressée, et exclut ses membres | Tests « refuse qu'un simple membre accepte une demande (403) », « refuse au chef d'une autre guilde d'accepter ou de refuser la demande (403) », « exclut un membre (200), mais pas le chef lui-même (409) » | Un membre, un joueur extérieur ou le chef d'une autre guilde reçoivent 403 ; la demande reste intacte | Conforme |
| G4 | Toutes les entrées sont validées avant d'atteindre le service | Tests « refuse un identifiant mal formé dans l'adresse (400) », « refuse un nom trop court (422), ou démesuré (400) » ; schémas `FoundGuildInput`, `IdParam`, `PlayerIdParam` de `contracts.ts` | Les identifiants de guilde et de demande doivent être des UUID ; le nom est borné par Zod, puis vérifié par le domaine | Conforme |
| G5 | Les règles d'unicité (nom, une guilde par joueur, une demande par joueur) restent vraies sous concurrence | Test « n'accepte qu'une fondation lorsque deux joueurs choisissent le même nom au même instant » ; contraintes de `drizzle/0012_guildes.sql` | La base refuse la seconde écriture ; le joueur reçoit 409 `NAME_TAKEN`, et une seule guilde existe | Conforme |
| G6 | Une guilde ne dépasse jamais huit membres, même lors d'acceptations simultanées | Test « refuse la demande adressée à une guilde complète (409) » ; lecture de `guild-service.ts` : la guilde est verrouillée (`FOR UPDATE`) avant le comptage des membres | Les acceptations d'une même guilde sont sérialisées par le verrou ; aucun test ne provoque deux acceptations simultanées sur la dernière place | Conforme, vérification partielle |
| G7 | Une demande expirée ne peut plus être acceptée | Test « refuse d'accepter une demande expirée (409), qui disparaît des vues » ; tests du domaine de la règle 8 | L'expiration est évaluée à l'acceptation, sans dépendre de la tâche quotidienne | Conforme |
| G8 | Les demandes reçues, et les noms des demandeurs, ne sont présentés qu'au chef | Test « présente la demande au demandeur et au seul chef » | Un simple membre reçoit une liste de demandes vide | Conforme |
| G9 | Le canal d'une guilde n'est accessible qu'à ses membres, et ne transmet aucune donnée | Tests « refuse le canal d'une guilde à un joueur qui n'en est pas membre (403) », « annonce les changements de la guilde à ses membres, sans données », « ne transmet pas les changements d'une autre guilde » | Un demandeur non membre reçoit 403 ; les événements n'ont que leur type. Un membre exclu continue de recevoir les types des changements jusqu'à la fermeture de son flux (240 s au plus) | Risque accepté (DT-012) |
| G10 | Les noms saisis par les joueurs ne peuvent pas injecter de code dans l'interface ni dans la base | `git grep -n dangerouslySetInnerHTML -- src app` (aucun résultat) ; lecture des adaptateurs : toutes les requêtes passent par Drizzle, avec des paramètres liés | React échappe les noms affichés ; aucune requête SQL n'est construite par concaténation | Conforme |
| G11 | L'export ne contient que les données du joueur, et l'effacement retire son nom de toutes les tables du module | Tests « exporte l'appartenance, la demande et la contribution du joueur », « efface le joueur : la guilde passe à un autre membre, et son nom disparaît » | L'export ne mentionne aucun autre joueur ; après effacement, ni `guild.members` ni `guild.requests` ne contiennent le nom. La contribution, sans nom, est conservée | Conforme |
| G12 | La tâche quotidienne du module n'est exécutable qu'avec le secret de la tâche planifiée | Test « supprime les demandes expirées, et seulement elles » (appel avec le secret) ; test existant de `src/platform/cron/cron-api.test.ts` sur le refus sans secret | La tâche est exposée par la route commune des tâches, déjà protégée par `CRON_SECRET` | Conforme |

## Synthèse

- Exigences examinées : 12.
- Conformes : 11, dont G6 avec une vérification partielle (le verrou est lu dans le code, mais la
  course sur la dernière place n'est pas reproduite par un test).
- Non conformes : 0.
- En risque accepté : 1, G9, consigné en dette DT-012 : un membre exclu peut recevoir, pendant au
  plus 240 secondes, le type des changements de son ancienne guilde. Il ne reçoit aucune donnée,
  et sa relecture de la vue ne lui montre plus la guilde.

Actions décidées :

1. Ajouter un test qui provoque deux acceptations simultanées pour la dernière place d'une
   guilde (G6), avant toute modification du verrouillage.
2. Revoir DT-012 si le canal doit un jour transmettre des données : vérifier l'appartenance à
   chaque lecture de la source, et non seulement à l'ouverture du flux.