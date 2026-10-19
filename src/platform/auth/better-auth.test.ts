import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '../db/client'
import { createBetterAuth } from './better-auth'
import type { AuthPort } from './port'

// Adresse de base des routes d'authentification, conforme à l'adresse locale par défaut.
const AUTH = 'http://localhost:3000/api/auth'

let auth: AuthPort
beforeEach(async () => {
  auth = createBetterAuth(await createTestDatabase())
})

/** Envoie une requête JSON à une route d'authentification. */
function post(path: string, body: unknown) {
  return auth.handler(
    new Request(`${AUTH}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    }),
  )
}

/** Extrait le cookie de session d'une réponse, sous la forme d'un en-tête de requête. */
function sessionCookie(res: Response): Headers {
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  return new Headers({ cookie })
}

const alice = { email: 'alice@example.com', password: 'motdepasse-solide', name: 'Alice' }

describe('Adaptateur Better Auth', () => {
  it("inscrit un joueur et l'identifie grâce à son cookie de session", async () => {
    const res = await post('/sign-up/email', alice)
    expect(res.status).toBe(200)

    const user = await auth.getUser(sessionCookie(res))
    expect(user?.name).toBe('Alice')
  })

  it("n'identifie personne sans cookie de session", async () => {
    expect(await auth.getUser(new Headers())).toBeNull()
  })

  it('refuse un mot de passe trop court', async () => {
    const res = await post('/sign-up/email', { ...alice, password: 'court' })
    expect(res.status).toBe(400)
  })

  it('refuse une connexion avec un mauvais mot de passe', async () => {
    await post('/sign-up/email', alice)
    const res = await post('/sign-in/email', { email: alice.email, password: 'mauvais-mot' })
    expect(res.status).toBe(401)
  })

  it('connecte un joueur existant avec le bon mot de passe', async () => {
    await post('/sign-up/email', alice)
    const res = await post('/sign-in/email', { email: alice.email, password: alice.password })

    expect(res.status).toBe(200)
    expect((await auth.getUser(sessionCookie(res)))?.name).toBe('Alice')
  })
})
