import { Hono } from 'hono'
import { z } from 'zod'
import { requireServiceSecret } from '../http/service-auth'
import type { AppEnv } from '../http/types'
import type { Dispatcher, Message } from './outbox'

/** Message transmis par un autre processus, tel qu'il figurait dans sa boîte d'envoi. */
const IncomingMessage = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  attempt: z.number().int().positive(),
})

/**
 * Boîte de réception (TD11) : reçoit les messages qu'un autre processus a enregistrés dans
 * sa propre boîte d'envoi, et les fait traiter par le gestionnaire de leur sujet.
 * La réponse 204 n'est envoyée qu'une fois le traitement réussi : l'expéditeur ne marque
 * le message comme traité qu'à sa réception, et le retentera sinon.
 * afterHandle est appelé après chaque message traité, par exemple pour distribuer aussitôt
 * les messages que son traitement a produits.
 */
export function createInboxApi(
  dispatcher: Dispatcher,
  secret: string,
  afterHandle: () => Promise<unknown> = async () => {},
) {
  return new Hono<AppEnv>().use(requireServiceSecret(secret)).post('/messages', async (c) => {
    const parsed = IncomingMessage.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'Message invalide' } }, 400)
    }
    await dispatcher.handle(parsed.data as Message)
    await afterHandle()
    return c.body(null, 204)
  })
}

/**
 * Gestionnaire qui transmet un message à la boîte de réception d'un autre processus.
 * Une réponse autre que 2xx lève une erreur : le message reste dans la boîte d'envoi,
 * et sera retenté selon les règles habituelles.
 */
export function forwardTo(url: string, secret: string, fetchFn: typeof fetch = fetch) {
  return async (message: Message) => {
    const res = await fetchFn(`${url}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify(message),
    })
    if (!res.ok) throw new Error(`Transmission refusée par ${url} (${res.status})`)
  }
}
