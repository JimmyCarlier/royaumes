import { Hono } from 'hono'

/**
 * Racine de composition : le seul endroit du projet qui connaît à la fois
 * la plateforme technique et l'ensemble des modules.
 * Ajouter un module consiste à l'instancier ici, puis à monter son API.
 */
export function createApi() {
  // Application principale : toutes ses routes sont préfixées par /api.
  const app = new Hono().basePath('/api')

  // Toute erreur non prévue produit une réponse JSON uniforme,
  // sans divulguer de détail technique au client.
  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: { code: 'INTERNAL', message: 'Erreur interne' } }, 500)
  })

  // Une adresse inconnue produit elle aussi une réponse JSON, et non une page HTML.
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } }, 404))

  return app
}

/** Type de l'application complète, déduit de ses routes. */
export type Api = ReturnType<typeof createApi>