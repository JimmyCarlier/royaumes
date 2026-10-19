import { getServer } from '@/bootstrap/server'

// Point d'entrée unique de l'API : Next.js délègue toutes les requêtes /api/* à Hono.

// L'API s'exécute dans l'environnement Node.js complet, et non dans l'environnement
// restreint « Edge » : la plateforme utilisera des bibliothèques propres à Node.js.
export const runtime = 'nodejs'

// Les réponses de l'API ne sont jamais mises en cache ni générées lors de la construction.
export const dynamic = 'force-dynamic'

// Chaque requête est transmise telle quelle à l'application Hono, qui se charge du routage.
const handle = (request: Request) => getServer().api.fetch(request)

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle