# Registre de la dette technique

Ce registre recense les raccourcis pris délibérément dans le projet. Chaque entrée
indique la nature du raccourci, ses conséquences et l'échéance prévue pour son
remboursement. Une entrée remboursée n'est pas supprimée : elle passe au statut « remboursée ».

Dans le code, chaque raccourci est signalé par un commentaire commençant par
`DETTE TECHNIQUE`, qui renvoie à ce registre.

| N° | Raccourci | Conséquences | Échéance | Statut |
| --- | --- | --- | --- | --- |
| DT-001 | Joueur unique : toutes les requêtes sont attribuées au joueur `demo` | Aucune séparation entre joueurs ; aucun contrôle d'accès | TD4 (authentification) | Remboursée au TD4 : intergiciel `requireUser` et Better Auth |
| DT-002 | Stockage en mémoire des événements du Village | Données perdues à chaque redémarrage ; non partagées entre plusieurs instances | TD3 (journal d'événements) | Remboursée au TD3 : adaptateur fondé sur le journal d'événements |
| DT-003 | Conflit de version non traité par le service du Village | Deux commandes simultanées : la seconde échoue avec une erreur 500 au lieu d'être rejouée | TD3 (concurrence optimiste) | Remboursée au TD3 : nouvel essai par `withOptimisticRetry` |
| DT-004 | Compteurs de la limitation des tentatives conservés dans la mémoire de chaque instance (`src/platform/auth/better-auth.ts`) | Limite réelle multipliée par le nombre d'instances actives | TD11 (revue de qualité) | Ouverte |
| DT-005 | Liste des expéditions ouvertes recalculée à chaque consultation, à partir du journal (`src/modules/dungeon/infrastructure/event-store-game-repository.ts`) | Coût de chaque consultation proportionnel à l'historique de toutes les expéditions, et non au nombre d'expéditions ouvertes | TD8 (projections) | Ouverte |
| DT-006 | Exploration sans échéance (`src/modules/dungeon/domain/rules.ts`) | Un joueur absent lorsque vient son tour bloque l'expédition pour tous ses membres | TD7 (intelligence artificielle) | Ouverte |