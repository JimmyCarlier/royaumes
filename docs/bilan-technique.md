# Bilan technique de Royaumes

- Date : 2026-10-21
- Version examinée : étiquette `td11-fin` (83 commits au HEAD examiné)
- Auteur : non renseigné dans le dépôt

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet. Les appréciations ci-dessous
distinguent les résultats mesurés des points qui restent à vérifier.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 6 : `realm`, `dungeon`, `market`, `ranking`, `tavern`, `system` |
| Briques de la plateforme | 9 : authentification, tâches planifiées, base de données, journal d'événements, HTTP, boîte d'envoi, confidentialité, projections et temps réel |
| Lignes de code, hors tests | 7 884 lignes TypeScript/TSX dans `src/`, tests exclus |
| Fichiers de test, nombre de tests | 33 fichiers ; 238 tests réussis lors de la vérification |
| Commits | 83 au HEAD examiné |
| Hébergement | Cible documentée : Vercel et Neon, régions de Francfort ; déploiement en production non confirmé. PGlite est utilisé en local et dans les tests. |

Les lignes de code sont comptées dans les fichiers `.ts` et `.tsx` de `src/`, hors fichiers
de test ; elles ne mesurent ni la complexité ni l'effort restant.

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 093 |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 064 |
| `market` | Event Sourcing, projection des offres, saga | 1 271 |
| `ranking` | Projection du journal | 459 |
| `tavern` | Tables ordinaires | 678 |
| `system` | Aucun | 73 |

La plateforme représente 1 589 lignes supplémentaires. Les résultats des mesures de lignes
proviennent du comptage des fichiers TypeScript et TSX du dépôt, hors tests.

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Six modules métier et neuf briques techniques assemblés dans une racine de composition ; règles de frontières automatisées. Le mode Village distant est testé localement. | Le découpage reste lisible et permet une extraction préparée sans imposer des services distribués à tous les modules. La vérification des frontières doit rester dans le processus de livraison. |
| 0002 | Event Sourcing pour le Village | État reconstruit par relecture ; tests de domaine, de dépôt et de concurrence optimiste. L'effacement des données personnelles réécrit de façon ciblée les champs concernés. | Le journal fournit une source de vérité et une reprise reproductible. La réécriture RGPD est une exception maîtrisée, qui exige de maintenir les contributeurs avec les formats d'événements. |
| 0003 | Server-Sent Events alimentés par le journal | Flux versionnés, reprise avec `Last-Event-ID`, autorisation par canal et route de repli ; tests de flux et d'accès. | Adapté à la diffusion serveur-vers-navigateur sans processus permanent. Le polling du journal, les limites d'exécution et le coût par connexion restent à surveiller. |
| 0004 | Manches simultanées et échéances paresseuses | Échéances enregistrées dans les événements, actions rattachées à un numéro de manche, résolution déterministe ; tests de règles et de vues. | Répond aux contraintes d'hébergement et protège le secret des choix. Une échéance peut être calculée à la lecture avant d'être persistée par une commande. |
| 0005 | Intelligence artificielle déterministe | Stratégies pures et générateur déterministe ; tests de stratégies, compagnons et simulations statistiques. | Reproductible et compatible avec les relectures. Les simulations dépendent de leurs hypothèses et ne constituent pas une preuve générale d'équilibre. |
| 0006 | CQRS et projections rattrapées à la lecture | Points de reprise versionnés et transactionnels ; les mesures de charge montrent une baisse du p99 des lectures de listes et agrégats concernés. | Modèles de lecture reconstruisibles et plus rapides sur les scénarios mesurés. Le rattrapage peut ajouter de la latence quand une projection a pris du retard. |
| 0007 | Saga orchestrée et boîte d'envoi | Événements et messages enregistrés dans la même transaction ; tests de concurrence, de remise répétée, de compensation et de reprise. | Permet les échanges sans transaction distribuée. La livraison au moins une fois implique des gestionnaires idempotents et un suivi des lettres mortes. |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Tables ordinaires pour messages et présence ; export et effacement portés par les contributeurs des modules. | Le choix distingue les données temporaires de l'historique métier. La revue RGPD existe mais ses constats et sa synthèse restent à renseigner. |
| 0009 | Extraction du Village, préparée mais non déployée | Service, passerelle, relais du journal et échanges de messages testés en local ; dette de migration, pagination et distribution autonome recensée. | La frontière est éprouvable sans engager un déploiement prématuré. L'extraction ne doit pas passer en production avant la résolution des dettes d'exploitation. |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture | 238/238 tests réussis, dans 33 fichiers. Le rapport de couverture existant indique 73,55 % des lignes et 63,21 % des branches ; sa date de production n'est pas indiquée. | Socle de tests conséquent pour les domaines, l'API et les composants de plateforme. La couverture des branches laisse des chemins non testés et le rapport doit être régénéré avant de servir de référence actuelle. |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | Mesures avant/après sous 20 connexions. p99 avant : 23–55 ms ; après : 22–37 ms. Débit après : 766–1 527 requêtes/s selon le scénario. 0 erreur dans les deux séries. Budget : p99 < 500 ms et 0 erreur. | Budget respecté pour les cinq scénarios mesurés. Les mesures sont des tests de charge synthétiques, pas une validation sous trafic réel ni une garantie de capacité en production. |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Tests couvrant les conflits optimistes, les remises répétées et les courses d'acceptation ; trois entrées de dette technique ouvertes concernent le service extrait. Aucun relevé de lettres mortes en production fourni. | Les mécanismes importants sont testés dans le dépôt. L'exploitation réelle des messages et la supervision des lettres mortes restent à valider sur un déploiement. |
| Sécurité | Exigences des revues de sécurité | Authentification : 16 exigences listées, 2 statuts « Conforme » explicitement renseignés (S6, S16), 14 sans statut. Donjon : 14, Marché : 10 ; constats et synthèses non renseignés. | Les exigences et plusieurs tests existent, mais les documents ne permettent pas de conclure à une revue complète. Ne pas assimiler une case vide à une conformité. |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | `dependency-cruiser` est prévu dans `pnpm verify` ; 2 fonctions d'aptitude sont testées. Le rapport de couverture existant indique 63,21 % des branches. | Les frontières et la propriété des données sont contrôlées automatiquement. Il reste à maintenir ces vérifications et à améliorer la couverture des chemins conditionnels. |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village autonome exécutable et relais testé localement ; PGlite en local/tests et adaptateur PostgreSQL pour une base distante. | La flexibilité est démontrée au niveau du code et des tests, pas par un déploiement opérationnel du service Village. |

Les mesures de charge proviennent de `perf/avant.json`, `perf/apres.json` et
`perf/budget.json`. Détail du p99 par scénario (avant → après) :

| Scénario | Débit après (req/s) | p99 avant → après |
| --- | ---: | ---: |
| Village | 1 527 | 23 → 22 ms |
| Expéditions ouvertes | 1 103 | 39 → 26 ms |
| Classement | 918 | 47 → 32 ms |
| Marché | 766 | 55 → 37 ms |
| Taverne | 1 289 | 24 → 22 ms |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 10 |
| Entrées remboursées, dont à l'échéance prévue | 7, toutes à l'échéance consignée |
| Entrées ouvertes | 3 : DT-008, DT-009 et DT-010 |

Les sept dettes remboursées concernent le contrôle d'accès, le stockage événementiel, la
concurrence optimiste, la limitation des tentatives, la projection des expéditions ouvertes,
les échéances d'exploration et l'exploitation des lettres mortes. Elles sont toutes
indiquées comme résolues au TD prévu dans le registre.

Les trois dettes ouvertes conditionnent l'extraction en production du Village : procédure
de migration propre à sa base, pagination du flux d'événements publié et distribution
régulière de sa boîte d'envoi même sans message entrant. Le service restant non déployé,
elles ne bloquent pas le mode intégré, mais doivent être levées avant de faire de l'extraction
un mode de production.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 critères listés | 2 explicitement marqués conformes (S6, S16) | Aucun constat de non-conformité renseigné ; 14 critères sans statut | Compléter les vérifications et la synthèse, notamment limitation des tentatives, secrets, CSRF et contrôle d'accès. |
| Sécurité du Donjon | 14 critères listés | Non renseigné | Non renseigné ; les statuts sont vides | Renseigner les preuves, statuts et synthèse pour chaque exigence. |
| Sécurité du Marché | 10 critères listés | Non renseigné | Non renseigné ; les statuts sont vides | Renseigner les preuves, statuts et synthèse, en particulier la protection des transferts et des canaux. |
| Conformité au RGPD | 10 critères listés | Non renseigné | Non renseigné ; les statuts sont vides | Compléter la revue et les synthèses ; remplacer les champs de contact et de date restés placeholders dans le registre. |

Les revues sont des documents de travail : leurs exigences et vérifications attendues sont
décrites, mais les colonnes de constat et de statut sont majoritairement vierges. Ce bilan
ne constitue donc pas une attestation de conformité sécurité ou RGPD. Les vérifications
juridiques et les engagements des sous-traitants doivent également être confirmés par le
responsable du traitement.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Une extraction du Village en production ne dispose pas encore des procédures nécessaires à son exploitation. | Migrations absentes ou incompatibles, relais volumineux après interruption, réponses de saga bloquées sans nouveau message entrant. | Avant activation, isoler et tester les migrations du service, paginer et reprendre le flux, puis mettre en place une distribution régulière et surveillée de sa boîte d'envoi. |
| 2 | L'état réel de conformité sécurité et RGPD n'est pas démontré par les documents de revue. | Critères sans statut, synthèses non rédigées, responsable et date de mise à jour laissés sous forme de placeholders dans le registre. | Nommer le responsable, achever chaque revue avec preuves et statuts, confirmer les durées et garanties des sous-traitants, puis traiter les écarts identifiés. |
| 3 | Les performances mesurées sur une charge synthétique ne préjugent pas de la capacité en production. | Hausse du p99, erreurs ou saturation de la base lorsque la concurrence, l'historique ou le nombre de connexions augmente. | Rejouer les tests avec un protocole documenté sur l'environnement cible, suivre p99/erreurs/charge de base et fixer des seuils d'alerte avant ouverture à davantage de joueurs. |

## 7. Conclusion

Royaumes dispose d'une architecture cohérente avec son contexte : un monolithe modulaire,
des frontières vérifiées, un journal pour les domaines qui ont besoin d'historique et des
modèles de lecture pour les agrégats. Les décisions sont généralement reliées à une
implémentation et accompagnées de tests. Les 238 tests exécutés lors de ce bilan passent,
et les scénarios de charge fournis respectent le budget défini.

Le niveau de preuve est toutefois inégal. Les mesures de performance sont synthétiques,
le rapport de couverture disponible n'est pas daté, les revues de sécurité et de conformité
ne comportent pas encore leurs synthèses, et l'extraction du Village n'a pas été déployée.
La priorité de reprise est donc de compléter les revues et le registre RGPD, puis de solder
les trois dettes du service avant toute extraction en production. En attendant, le mode
monolithe intégré est le mode de fonctionnement à privilégier.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger ce bilan à partir des ADR, des
registres de qualité et RGPD, du rapport de couverture, des résultats de charge et de
l'exécution de la suite Vitest. Les chiffres de tests, de lignes, de commits et de
performance ont été vérifiés dans le dépôt. Les conclusions de conformité ne sont pas
présumées : les revues dont les constats ou les statuts sont absents sont explicitement
signalées comme incomplètes.
