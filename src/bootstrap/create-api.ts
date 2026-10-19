import { Hono } from 'hono'
import { createRealmModule } from '@/modules/realm'
import { createSystemModule } from '@/modules/system'
import type { EventStore } from '@/platform/event-store/event-store'
import { demoUser } from '@/platform/http/demo-user'
import type { AppEnv } from '@/platform/http/types'

/** Dépendances fournies à l'application par son point d'entrée. */
export interface ApiDeps {
  /** Journal d'événements, transmis aux modules qui l'utilisent. */
  store: EventStore
  /** Attendue avant chaque requête : résolue lorsque la base est prête (migrations). */
  ready?: Promise<void>
  /** Horloge de référence ; l'heure réelle par défaut. Remplacée dans les tests. */
  clock?: () => number
}

/**
 * Racine de composition : le seul endroit du projet qui connaît à la fois
 * la plateforme technique et l'ensemble des modules.
 * Ajouter un module consiste à l'instancier ici, puis à monter son API.
 */
export function createApi({ store, ready, clock }: ApiDeps) {
  // 1. Instanciation des modules, avec les dépendances fournies par la plateforme.
  const system = createSystemModule()
  const realm = createRealmModule({ store, clock })

  // 2. Application principale : toutes ses routes sont préfixées par /api.
  const app = new Hono<AppEnv>().basePath('/api')

  // 3. Aucune requête n'est traitée avant que la base de données soit prête.
  //    La promesse n'est réellement attendue qu'au démarrage ; ensuite, elle est déjà résolue.
  app.use(async (_c, next) => {
    await ready
    await next()
  })

  // 4. Toute erreur non prévue produit une réponse JSON uniforme,
  //    sans divulguer de détail technique au client.
  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: { code: 'INTERNAL', message: 'Erreur interne' } }, 500)
  })

  // Une adresse inconnue produit elle aussi une réponse JSON, et non une page HTML.
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } }, 404))

  // 5. Identification du joueur pour les routes qui en ont besoin.
  //    Provisoire : un joueur unique, en attendant l'authentification du TD4.
  app.use('/realm/*', demoUser())

  // 6. Montage des sous-applications : chaque module reçoit son propre préfixe.
  //    Les appels sont chaînés afin que TypeScript conserve le type de chaque route.
  return app.route('/system', system.api).route('/realm', realm.api)
}

/** Type de l'application complète, déduit de ses routes. */
export type Api = ReturnType<typeof createApi>
