# Registre des décisions d'architecture

Chaque décision d'architecture du projet est consignée dans un ADR, à partir du modèle
`template.md`. Un ADR accepté n'est jamais modifié sur le fond : si la décision évolue,
un nouvel ADR est rédigé et l'ancien prend le statut « remplacé ».

| N° | Décision | Statut |
| --- | --- | --- |
| [0001](0001-monolithe-modulaire.md) | Monolithe modulaire plutôt que microservices | Accepté |
| [0002](0002-event-sourcing-village.md) | Event Sourcing pour le Village | Accepté |
| [0003](0003-server-sent-events.md) | Server-Sent Events, alimentés par le journal, pour le temps réel | Accepté |
| [0004](0004-manches-simultanees.md) | Manches simultanées et échéances paresseuses pour le Donjon | Accepté |
| [0005](0005-intelligence-artificielle.md) | Intelligence artificielle déterministe, sans tâche de fond | Accepté |
| [0006](0006-cqrs-projections.md) | CQRS : modèles de lecture tenus par des projections rattrapées à la lecture | Accepté |
| [0007](0007-saga-boite-envoi.md) | Saga orchestrée et boîte d'envoi transactionnelle pour les opérations entre modules | Accepté |