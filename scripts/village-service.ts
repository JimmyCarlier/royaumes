/**
 * Démarrage du service Village extrait (TD11), dans un processus distinct de l'application.
 *
 *   SERVICE_SECRET=<secret> pnpm exec tsx scripts/village-service.ts
 *
 * Le service écoute sur le port 4000, et conserve ses données dans sa propre base :
 * .data/village en local, ou la base désignée par VILLAGE_DATABASE_URL.
 * L'application doit être démarrée avec REALM_SERVICE_URL=http://localhost:4000
 * et le même SERVICE_SECRET.
 */
import { serve } from '@hono/node-server'
import { createDatabase } from '@/platform/db/client'
import { createVillageServiceApp } from '@/services/village/village-service'

const secret = process.env.SERVICE_SECRET
if (!secret) throw new Error('SERVICE_SECRET est obligatoire : il authentifie les échanges.')
const port = Number(process.env.PORT ?? 4000)

// DETTE TECHNIQUE (docs/qualite/dette-technique.md, service Village) : la base locale reçoit
// toutes les migrations de l'application, y compris les tables des autres modules ; une base
// désignée par VILLAGE_DATABASE_URL n'en reçoit aucune.
const { db, ready } = createDatabase(process.env.VILLAGE_DATABASE_URL, 'village')
await ready

const app = createVillageServiceApp({
  db,
  secret,
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
})
serve({ fetch: app.fetch, port })
console.log(`Service Village : http://localhost:${port}`)
