import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type Db } from '../db/client'
import { createBetterAuth } from './better-auth'
import type { AuthPort } from './port'
import { account, rateLimit, user } from './schema'

// Adresse de base des routes d'authentification, conforme à l'adresse locale par défaut.
const AUTH = 'http://localhost:3000/api/auth'

let db: Db
let auth: AuthPort
beforeEach(async () => {
  db = await createTestDatabase()
  auth = createBetterAuth(db)
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

describe('Revue de sécurité', () => {
  it("ne conserve qu'une empreinte du mot de passe", async () => {
    await post('/sign-up/email', alice)
    const [row] = await db
      .select({ password: account.password })
      .from(account)
      .innerJoin(user, eq(account.userId, user.id))
      .where(eq(user.email, alice.email))

    expect(row.password).toBeTruthy()
    expect(row.password).not.toContain(alice.password)
  })

  it('pose un cookie de session inaccessible au JavaScript de la page', async () => {
    const res = await post('/sign-up/email', alice)
    const cookie = res.headers.get('set-cookie') ?? ''

    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it("répond de la même manière que l'adresse existe ou non, à la connexion", async () => {
    await post('/sign-up/email', alice)
    const known = await post('/sign-in/email', { email: alice.email, password: 'mauvais-mot' })
    const unknown = await post('/sign-in/email', {
      email: 'inconnu@example.com',
      password: 'x-mot-de-passe',
    })

    expect(known.status).toBe(unknown.status)
    expect(await known.json()).toEqual(await unknown.json())
  })
})

describe('Limitation des tentatives', () => {
  /** Tentative de connexion avec un mauvais mot de passe, depuis une adresse IP donnée. */
  const attempt = (instance: AuthPort) =>
    instance.handler(
      new Request(`${AUTH}/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          'x-forwarded-for': '203.0.113.7',
        },
        body: JSON.stringify({ email: 'inconnu@example.com', password: 'mauvais-mot' }),
      }),
    )

  it('conserve les compteurs dans la base, où toutes les instances les partagent', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 61; i++) statuses.push((await attempt(auth)).status)

    // Soixante tentatives par minute sont admises, la soixante et unième est refusée.
    expect(statuses.slice(0, 60).every((status) => status === 401)).toBe(true)
    expect(statuses[60]).toBe(429)

    // Le compteur est une ligne de la base : une autre instance, dans un autre processus,
    // le lit et le met à jour. Deux instances d'un même processus ne prouveraient rien,
    // car elles partageraient aussi un compteur conservé en mémoire.
    const rows = await db.select().from(rateLimit)
    expect(rows).toHaveLength(1)
    expect(rows[0].count).toBe(60)
  })
})
