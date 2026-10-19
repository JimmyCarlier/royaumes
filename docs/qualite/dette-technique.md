# Registre de la dette technique

Ce registre recense les raccourcis pris délibérément dans le projet. Chaque entrée
indique la nature du raccourci, ses conséquences et l'échéance prévue pour son
remboursement. Une entrée remboursée n'est pas supprimée : elle passe au statut « remboursée ».

Dans le code, chaque raccourci est signalé par un commentaire commençant par
`DETTE TECHNIQUE`, qui renvoie à ce registre.

| N° | Raccourci | Conséquences | Échéance | Statut |
| --- | --- | --- | --- | --- |
| DT-001 | Joueur unique : toutes les requêtes sont attribuées au joueur `demo` (`src/platform/http/demo-user.ts`) | Aucune séparation entre joueurs ; aucun contrôle d'accès | TD4 (authentification) | Ouverte |
| DT-002 | Stockage en mémoire des événements du Village (`in-memory-village-repository.ts`) | Données perdues à chaque redémarrage ; non partagées entre plusieurs instances | TD3 (journal d'événements) | Ouverte |
| DT-003 | Conflit de version non traité par le service du Village | Deux commandes simultanées : la seconde échoue avec une erreur 500 au lieu d'être rejouée | TD3 (concurrence optimiste) | Ouverte |