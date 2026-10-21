import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { Pool } from 'pg'

/**
 * Type commun aux deux pilotes (PGlite et pg).
 * Le reste du code ne manipule que ce type : il ignore quelle base est utilisée.
 */
export type Db = PgDatabase<PgQueryResultHKT>

export interface Database {
  db: Db
  /** Promesse résolue lorsque le schéma est prêt, c'est-à-dire les migrations appliquées. */
  ready: Promise<void>
}

/** Répertoire des migrations SQL produites par drizzle-kit. */
const MIGRATIONS = path.join(process.cwd(), 'drizzle')

/**
 * Crée la connexion à la base de données.
 * - Si DATABASE_URL est définie (production, TD5) : PostgreSQL hébergé, par le pilote pg.
 *   Les migrations y sont appliquées lors du déploiement, et non au démarrage.
 * - Sinon (développement) : PGlite, dont les données sont conservées dans .data/<name>,
 *   et dont les migrations sont appliquées au démarrage. Le nom distingue les bases de
 *   plusieurs processus : l'application (pglite) et le service Village extrait (TD11).
 */
export function createDatabase(url = process.env.DATABASE_URL, name = 'pglite'): Database {
  if (url) {
    const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5) })
    return { db: drizzlePg(pool) as unknown as Db, ready: Promise.resolve() }
  }

  // Sur Vercel, l'absence de DATABASE_URL est une erreur de configuration :
  // PGlite y écrirait sur un disque éphémère, et les données seraient perdues.
  if (process.env.VERCEL) {
    throw new Error(
      'DATABASE_URL est absente : connectez une base Neon au projet Vercel, puis redéployez.',
    )
  }

  const dataDir = path.join(process.cwd(), '.data', name)
  mkdirSync(dataDir, { recursive: true })
  const db = drizzlePglite(new PGlite(dataDir))
  return {
    db: db as unknown as Db,
    ready: migratePglite(db, { migrationsFolder: MIGRATIONS }),
  }
}

/** Bases de test, partagées par tous les tests d'un même fichier, une par nom. */
const testDbs = new Map<string, Promise<Db>>()

/**
 * Base PostgreSQL en mémoire, destinée aux tests.
 * Une seule instance est créée par fichier de test et par nom, car le démarrage de PGlite
 * prend environ une seconde ; elle est ensuite vidée avant chaque test,
 * afin que les tests restent indépendants les uns des autres. Un test qui simule deux
 * processus, l'application et un service extrait, utilise deux noms, donc deux bases.
 */
export async function createTestDatabase(name = 'default'): Promise<Db> {
  if (!testDbs.has(name)) {
    testDbs.set(
      name,
      (async () => {
        const db = drizzlePglite(new PGlite())
        await migratePglite(db, { migrationsFolder: MIGRATIONS })
        return db as unknown as Db
      })(),
    )
  }
  const db = (await testDbs.get(name)) as Db

  // Vide toutes les tables du projet, et remet les compteurs automatiques à leur valeur initiale.
  await db.execute(
    sql.raw(`DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT schemaname, tablename FROM pg_tables
               WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'drizzle') LOOP
        EXECUTE format('TRUNCATE %I.%I RESTART IDENTITY CASCADE', r.schemaname, r.tablename);
      END LOOP; END $$;`),
  )
  return db
}
