import { Hono } from 'hono'
import { createSystemModule } from '@/modules/system'

/**
 * Racine de composition : le seul endroit du projet qui connaît à la fois
 * la plateforme technique et l'ensemble des modules.
 * Ajouter un module consiste à l'instancier ici, puis à monter son API.
 */
export function createApi() {
  // 1. Instanciation des modules. Leurs dépendances (base de données,
  //    journal d'événements, authentification) leur seront fournies ici.
  const system = createSystemModule()

  // 2. Application principale : toutes ses routes sont préfixées par /api.
  const app = new Hono().basePath('/api')

  // 3. Toute erreur non prévue produit une réponse JSON uniforme,
  //    sans divulguer de détail technique au client.
  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: { code: 'INTERNAL', message: 'Erreur interne' } }, 500)
  })

  // Une adresse inconnue produit elle aussi une réponse JSON, et non une page HTML.
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } }, 404))

  // 4. Montage des sous-applications : chaque module reçoit son propre préfixe.
  //    Les appels sont chaînés afin que TypeScript conserve le type de chaque route.
  return app.route('/system', system.api)
}

/** Type de l'application complète, déduit de ses routes. */
export type Api = ReturnType<typeof createApi>
