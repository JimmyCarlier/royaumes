/**
 * Test de charge reproductible (TD11).
 *
 *   pnpm build && AUTH_RATE_LIMIT=off pnpm start     dans un premier terminal
 *   pnpm exec tsx scripts/load-test.ts [étiquette]   dans un second terminal
 *
 * Le script prépare un jeu de données (joueurs, villages, expéditions, offres, messages),
 * puis mesure, pour chaque scénario, le débit et les centiles de latence. Les résultats sont
 * affichés, et enregistrés dans perf/<étiquette>.json pour être comparés d'une mesure à l'autre.
 * Ils sont enfin confrontés au budget de performance, fixé dans perf/budget.json : le script
 * se termine en erreur si un scénario le dépasse.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import autocannon from 'autocannon'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const label = process.argv[2] ?? 'mesure'
/** Nombre de joueurs créés pour la mesure. */
const PLAYERS = 20
/** Durée de chaque scénario, en secondes, et nombre de connexions simultanées. */
const DURATION = 10
/** Budget de performance : p99 et nombre d'erreurs maximaux, pour un nombre de connexions. */
const budget = JSON.parse(readFileSync('perf/budget.json', 'utf8')) as {
  connections: number
  maxP99Ms: number
  maxErrors: number
}
const CONNECTIONS = budget.connections

/** Requête JSON, avec le cookie de session d'un joueur. */
async function call(path: string, method: string, cookie: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: BASE, cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** Crée un joueur et renvoie son cookie de session. */
async function signUp(n: number) {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({
      name: `Charge ${n}`,
      email: `charge-${n}-${Date.now()}@example.com`,
      password: 'motdepasse-de-charge',
    }),
  })
  if (!res.ok) throw new Error(`Inscription refusée (${res.status}) : AUTH_RATE_LIMIT=off ?`)
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

// 1. Jeu de données : chaque joueur fonde un village, ouvre une expédition, publie une offre
//    et écrit un message. Les mesures portent ainsi sur des tables et un journal non vides.
const cookies: string[] = []
for (let n = 0; n < PLAYERS; n++) {
  const cookie = await signUp(n)
  cookies.push(cookie)
  await call('/api/realm/village', 'POST', cookie, { name: `Village ${n}` })
  await call('/api/dungeon/games', 'POST', cookie, { difficulty: 'easy' })
  await call('/api/market/offers', 'POST', cookie, { give: { wood: 10 }, want: { stone: 5 } })
  await call('/api/tavern/messages', 'POST', cookie, { body: `Bonjour de ${n}` })
}

// 2. Scénarios : des lectures, celles que chaque joueur déclenche le plus souvent.
const scenarios = [
  { name: 'Village', path: '/api/realm/village' },
  { name: 'Expéditions ouvertes', path: '/api/dungeon/games' },
  { name: 'Classement', path: '/api/ranking/players' },
  { name: 'Marché', path: '/api/market/offers' },
  { name: 'Taverne', path: '/api/tavern/messages' },
]

const results = []
for (const scenario of scenarios) {
  const result = await autocannon({
    url: `${BASE}${scenario.path}`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: { cookie: cookies[0] },
  })
  results.push({
    scenario: scenario.name,
    requestsPerSecond: Math.round(result.requests.average),
    p50: result.latency.p50,
    p99: result.latency.p99,
    errors: result.errors + result.non2xx,
  })
}

// 3. Résultats : un tableau à l'écran, et un fichier pour les comparaisons ultérieures.
console.table(results)
mkdirSync('perf', { recursive: true })
writeFileSync(`perf/${label}.json`, `${JSON.stringify(results, null, 2)}\n`)
console.log(`Résultats enregistrés dans perf/${label}.json`)

// 4. Budget : chaque scénario doit le respecter. Un dépassement fait échouer le script.
const over = results.filter((r) => r.p99 > budget.maxP99Ms || r.errors > budget.maxErrors)
for (const r of over) {
  console.error(`Budget dépassé : ${r.scenario} (p99 ${r.p99} ms, ${r.errors} erreur(s))`)
}
if (over.length > 0) process.exit(1)
console.log(`Budget respecté : p99 inférieur à ${budget.maxP99Ms} ms, sans erreur.`)
