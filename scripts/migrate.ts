/**
 * Applique les migrations SQL du répertoire drizzle/ à la base de production.
 * Ce script est exécuté par Vercel pendant la construction, avant la mise en ligne.
 * En local, sans DATABASE_URL, il ne fait rien : PGlite applique ses migrations au démarrage.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

// Neon fournit deux adresses : une connexion mutualisée (pooled), adaptée aux requêtes
// de l'application, et une connexion directe, préférable pour les migrations.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

if (!url) {
  console.log('DATABASE_URL absente : migrations ignorées (PGlite est migré au démarrage).')
  process.exit(0)
}

const pool = new Pool({ connectionString: url })
await migrate(drizzle(pool), { migrationsFolder: 'drizzle' })
await pool.end()
console.log('Migrations appliquées.')
