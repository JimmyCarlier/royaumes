# Bilan technique de Royaumes

- Date : 2026-10-23
- Version examinée : étiquette `eval-fin`, comparée à l'étiquette `td11-fin`
- Auteur : Jimmy Carlier

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 7 : `system`, `realm`, `dungeon`, `ranking`, `market`, `tavern`, `guild` (6 à `td11-fin`) |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` |
| Lignes de code, hors tests | 10 111 (8 359 à `td11-fin`) |
| Fichiers de test, nombre de tests | 38 fichiers, 299 tests (33 fichiers, 238 tests à `td11-fin`) |
| Commits | NOMBRE_DE_COMMITS (83 à `td11-fin`) |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 093 |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 064 |
| `market` | Event Sourcing, projection des offres, saga | 1 271 |
| `ranking` | Projection du journal | 459 |
| `tavern` | Tables ordinaires | 678 |
| `guild` | Tables ordinaires, projection des contributions | 1 725 |
| `system` | Aucun | 73 |

Les six modules existants ont exactement le même nombre de lignes qu'à `td11-fin` : le module
Guildes a été ajouté sans les modifier.

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) ; ajout du module Guildes (évaluation) | Le module Guildes a été ajouté sans modifier aucun autre module : seules la racine de composition, la navigation et une interface de la plateforme ont changé |
| 0002 | Event Sourcing pour le Village | Saga du Marché (TD9), projections (TD8) | Le langage publié du Village nourrit le Classement et les Guildes sans modification du Village |
| 0003 | Server-Sent Events alimentés par le journal | Canaux du Donjon, du Marché, de la Taverne, puis un canal par guilde | Extensible : une source propre à un module peut désormais servir plusieurs canaux (ADR 0012) |
| 0004 | Manches simultanées et échéances paresseuses | Expéditions à plusieurs joueurs ; échéance des demandes d'adhésion des Guildes | Le principe de l'échéance évaluée à la lecture a été repris, sans tâche de fond, pour les Guildes |
| 0005 | Intelligence artificielle déterministe | Simulation de l'équilibre et tests statistiques | Équilibre mesurable et reproductible |
| 0006 | CQRS et projections rattrapées à la lecture | Classement, expéditions ouvertes, offres, contributions des Guildes | Le moteur des projections a été réutilisé tel quel par les Guildes |
| 0007 | Saga orchestrée et boîte d'envoi | Échanges du Marché, extraction du Village | Non utilisée par les Guildes, qui n'ont rien à demander aux autres modules |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Effacement d'un compte dans tous les modules | Le même raisonnement a conduit à des tables ordinaires pour les Guildes |
| 0009 | Extraction du Village, préparée mais non déployée | Tests du service extrait | Non déployée en production |
| 0010 | Guildes en tables classiques, protégées par des contraintes d'unicité | Test des fondations simultanées d'un même nom | Les règles qui portent sur toutes les guildes sont garanties par la base sous concurrence |
| 0011 | Score des guildes par une projection du langage publié | Tests de la projection et du classement | Communication avec le Village et le Donjon sans les modifier ; dépend de la forme de `GameEnded` |
| 0012 | Un canal par guilde, alimenté par une table d'activité | Parcours à deux joueurs, tests d'accès au canal | Accès vérifié à l'ouverture du flux seulement (DT-012) |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 299 tests sur 299 (238 à `td11-fin`) | Chaque règle de la fiche de cadrage est vérifiée par au moins un test |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | À `td11-fin` (`perf/apres.json`) : p99 de 22 à 37 ms selon les lectures, pour un budget de 500 ms ; lectures des Guildes non mesurées | Budget respecté à `td11-fin` ; les lectures des Guildes restent à mesurer |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence | Fondations simultanées d'un même nom ; application unique de la projection ; reconstruction | Sans changement pour les modules existants |
| Sécurité | Exigences des revues de sécurité | Guildes : 11 exigences conformes sur 12, 1 en risque accepté | Voir la section 5 |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | 7 règles de dependency-cruiser, 0 violation ; 2 fonctions d'aptitude ; couverture des lignes 76,04 % (75,14 % à `td11-fin`) | La couverture progresse légèrement ; aucune règle n'a été assouplie |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Extraction du Village (TD11) ; PGlite en local et en test, Neon en production | Un module en tables classiques s'ajoute sans toucher au journal |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 12 (DT-001 à DT-012) |
| Entrées remboursées, dont à l'échéance prévue | 7, toutes à l'échéance prévue |
| Entrées ouvertes | 5 : DT-008 à DT-010 (service Village extrait), DT-011 et DT-012 (Guildes) |

Analyse : la dette remboursée l'a été à chaque fois au TD prévu. Les trois entrées ouvertes du
service Village ne pèsent pas sur la production, où le service n'est pas déployé. Les deux
entrées des Guildes sont des choix de simplicité assumés : le classement est calculé en mémoire
(DT-011), ce qui convient au nombre de guildes du projet, et l'accès au canal n'est vérifié qu'à
l'ouverture du flux (DT-012), ce qui ne divulgue aucune donnée. Chacune porte un seuil de
réexamen dans le registre.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | Constats non renseignés dans la revue | Constats non renseignés dans la revue | À établir |
| Sécurité du Donjon | 14 | Constats non renseignés dans la revue | Constats non renseignés dans la revue | À établir |
| Sécurité du Marché | 10 | Constats non renseignés dans la revue | Constats non renseignés dans la revue | À établir |
| Sécurité des Guildes | 12 | 11 | 1 en risque accepté (G9, DT-012) | 2 : tester deux acceptations simultanées pour la dernière place ; revoir DT-012 si le canal transmet un jour des données |
| Conformité au RGPD | 10 | Constats non renseignés dans la revue | Constats non renseignés dans la revue | À établir |

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Une évolution des données de `GameEnded` par le Donjon fausse le score des guildes et le classement des joueurs, sans qu'aucun test ne le détecte | Écarts entre le classement des joueurs et le score des guildes | Décrire le langage publié du Donjon dans son contrat, et le faire vérifier par un test commun aux lecteurs |
| 2 | Le coût des lectures croît avec le journal et le nombre de guildes : rattrapage des projections à chaque consultation, classement des guildes calculé en mémoire (DT-011) | p99 des lectures du classement ou des Guildes qui approche le budget de 500 ms | Ajouter les lectures des Guildes à `scripts/load-test.ts`, puis paginer et stocker le score si nécessaire |
| 3 | Un membre exclu continue de recevoir, quelques minutes, le type des changements de son ancienne guilde (DT-012) | Besoin de transmettre des données sur le canal d'une guilde | Vérifier l'appartenance à chaque lecture de la source, et non seulement à l'ouverture du flux |
| 4 | Les revues de sécurité de l'authentification, du Donjon et du Marché, et la revue de conformité au RGPD, n'ont ni constats ni synthèse : une non-conformité peut exister sans être connue | Revue sans synthèse | Renseigner les constats et les synthèses de ces quatre revues |

## 7. Conclusion

Le projet s'est enrichi d'un septième module, les Guildes, sans modification des modules
existants ni assouplissement des règles d'architecture. Il illustre les deux modèles de stockage
du projet : des tables ordinaires pour les adhésions, et une projection du journal pour les
contributions. Les points à traiter en priorité par la personne qui reprendrait le projet sont
les constats des revues antérieures, la mesure des performances des Guildes, et la description
explicite du langage publié du Donjon.

## Usage de l'IA générative

Claude (Anthropic), utilisé comme assistant de rédaction : structure du bilan et formulation des
appréciations. Les valeurs ont été mesurées par des commandes (`pnpm test:coverage` à
`td11-fin` et au rendu, `git rev-list --count`, comptage des lignes), puis reportées et relues
par l'auteur.