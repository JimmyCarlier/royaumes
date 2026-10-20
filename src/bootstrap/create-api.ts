import { Hono } from 'hono'
import { createDungeonModule } from '@/modules/dungeon'
import { createRankingModule } from '@/modules/ranking'
import { createRealmModule } from '@/modules/realm'
import { createSystemModule } from '@/modules/system'
import type { AuthPort } from '@/platform/auth/port'
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import { requireUser } from '@/platform/http/require-user'
import type { AppEnv } from '@/platform/http/types'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createRealtimeApi, type RealtimeOptions } from '@/platform/realtime/stream-api'

/** Dépendances fournies à l'application par son point d'entrée. */
export interface ApiDeps {
  /** Authentification : Better Auth en fonctionnement réel, un adaptateur simplifié en test. */
  auth: AuthPort
  /** Base de données, dans laquelle les modules tiennent leurs modèles de lecture. */
  db: Db
  /** Journal d'événements, transmis aux modules qui l'utilisent. */
  store: EventStore
  /** Attendue avant chaque requête : résolue lorsque la base est prête (migrations). */
  ready?: Promise<void>
  /** Horloge de référence ; l'heure réelle par défaut. Remplacée dans les tests. */
  clock?: () => number
  /** Réglages du temps réel (durée des flux, intervalle de lecture) ; raccourcis dans les tests. */
  realtime?: Partial<Omit<RealtimeOptions, 'store' | 'policies'>>
}

/**
 * Racine de composition : le seul endroit du projet qui connaît à la fois
 * la plateforme technique et l'ensemble des modules.
 * Ajouter un module consiste à l'instancier ici, puis à monter son API.
 */
export function createApi({ auth, db, store, ready, clock, realtime }: ApiDeps) {
  // 0. Briques de la plateforme partagées par plusieurs modules.
  const projections = createProjectionRunner(db)

  // 1. Instanciation des modules, avec les dépendances fournies par la plateforme.
  const system = createSystemModule()
  const realm = createRealmModule({ store, clock })
  const dungeon = createDungeonModule({ store, clock })
  const ranking = createRankingModule({ db, projections })

  // Règles d'accès aux canaux temps réel, déclarées par les modules.
  const policies: ChannelPolicy[] = [realm.channelPolicy, dungeon.channelPolicy]

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

  // 5. Routes d'authentification (inscription, connexion, déconnexion, session),
  //    entièrement traitées par l'adaptateur d'authentification.
  app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))

  // 6. Routes réservées aux joueurs connectés : toute requête anonyme est refusée (401).
  //    Chaque nouveau module dont les routes sont réservées aux joueurs est ajouté ici.
  app.use('/realm/*', requireUser(auth))
  app.use('/dungeon/*', requireUser(auth))
  app.use('/ranking/*', requireUser(auth))
  app.use('/stream/*', requireUser(auth))

  // 7. Montage des sous-applications : chaque module reçoit son propre préfixe.
  //    Les appels sont chaînés afin que TypeScript conserve le type de chaque route.
  return app
    .route('/system', system.api)
    .route('/realm', realm.api)
    .route('/dungeon', dungeon.api)
    .route('/ranking', ranking.api)
    .route('/stream', createRealtimeApi({ store, policies, ...realtime }))
}

/** Type de l'application complète, déduit de ses routes. */
export type Api = ReturnType<typeof createApi>
