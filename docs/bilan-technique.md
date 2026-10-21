# Bilan technique de Royaumes

- Date : AAAA-MM-JJ
- Version examinée : étiquette `td11-fin`
- Auteur :

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | |
| Briques de la plateforme | |
| Lignes de code, hors tests | |
| Fichiers de test, nombre de tests | |
| Commits | |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | |
| `market` | Event Sourcing, projection des offres, saga | |
| `ranking` | Projection du journal | |
| `tavern` | Tables ordinaires | |
| `system` | Aucun | |

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) | |
| 0002 | Event Sourcing pour le Village | | |
| 0003 | Server-Sent Events alimentés par le journal | | |
| 0004 | Manches simultanées et échéances paresseuses | | |
| 0005 | Intelligence artificielle déterministe | | |
| 0006 | CQRS et projections rattrapées à la lecture | | |
| 0007 | Saga orchestrée et boîte d'envoi | | |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | | |
| 0009 | Extraction du Village, préparée mais non déployée | | |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | | |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | | |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | | |
| Sécurité | Exigences des revues de sécurité | | |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | | |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | | |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | |
| Entrées remboursées, dont à l'échéance prévue | |
| Entrées ouvertes | |

Analyse :

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | | | | |
| Sécurité du Donjon | | | | |
| Sécurité du Marché | | | | |
| Conformité au RGPD | | | | |

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |

## 7. Conclusion

## Usage de l'IA générative

Outil utilisé, nature de sa contribution, manière dont le résultat a été vérifié.
Indiquer « Aucun » le cas échéant.