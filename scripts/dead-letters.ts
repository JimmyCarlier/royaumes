/**
 * Exploitation de la boîte d'envoi : examen et relance des messages abandonnés.
 *
 *   pnpm exec tsx scripts/dead-letters.ts             liste les messages abandonnés
 *   pnpm exec tsx scripts/dead-letters.ts retry <id>  relance un message, une fois sa cause corrigée
 *
 * Le script agit sur la base désignée par DATABASE_URL, ou à défaut sur la base PGlite locale.
 * Un message relancé est remis à la distribution suivante : consultation du Marché,
 * ou tâche quotidienne.
 */
import { createDatabase } from '@/platform/db/client'
import { createDispatcher } from '@/platform/outbox/outbox'

const { db, ready } = createDatabase()
await ready
// Aucun gestionnaire n'est enregistré : le script ne distribue rien, il examine et relance.
const dispatcher = createDispatcher(db)
const [command, id] = process.argv.slice(2)

if (command === 'retry' && id) {
  const done = await dispatcher.retry(id)
  console.log(done ? `Message ${id} relancé.` : `Message ${id} introuvable, ou non abandonné.`)
} else {
  const messages = await dispatcher.abandoned()
  if (messages.length === 0) console.log('Aucun message abandonné.')
  for (const m of messages) {
    console.log(`${m.id}  ${m.topic}  ${m.attempts} tentatives  ${m.createdAt.toISOString()}`)
    console.log(`  contenu : ${JSON.stringify(m.payload)}`)
    console.log(`  dernière erreur : ${m.lastError}`)
  }
}
process.exit(0)
