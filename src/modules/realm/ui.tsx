'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import type { RealmApi } from './api'
import {
  BUILDINGS,
  type Building,
  type DomainError,
  RESOURCES,
  type Stock,
  stockAt,
  type VillageView,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RealmApi>('/api/realm')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: DomainError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  ALREADY_FOUNDED: 'Village déjà fondé.',
  NOT_FOUNDED: "Aucun village pour l'instant.",
  MAX_LEVEL_REACHED: 'Niveau maximum atteint.',
  INSUFFICIENT_RESOURCES: 'Ressources insuffisantes.',
}

/** Indique si le stock couvre un coût ; faux si le coût est absent (niveau maximal). */
function canAfford(stock: Stock, cost: Partial<Stock> | null) {
  return !!cost && Object.entries(cost).every(([r, n]) => stock[r as keyof Stock] >= (n ?? 0))
}

/** Écran du Village : fondation, stock et bâtiments. */
export function VillageScreen() {
  // undefined : chargement en cours ; null : aucun village fondé.
  const [view, setView] = useState<VillageView | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  // REQUÊTE : lecture de la vue du village.
  const refresh = useCallback(async () => {
    const res = await client.village.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Le stock est extrapolé localement deux fois par seconde, sans interroger le serveur.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  async function found(name: string) {
    const res = await client.village.$post({ json: { name } })
    handle(await res.json())
  }
  async function upgrade(building: Building) {
    const res = await client.village.upgrade.$post({ json: { building } })
    handle(await res.json())
  }
  function handle(body: { view: VillageView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
    } else {
      setError(null)
      setView(body.view)
    }
  }

  const title = (
    <h1>
      <Entity kind="village" /> {view?.name ?? 'Royaumes'}
    </h1>
  )

  // Chargement en cours.
  if (view === undefined) return title

  // Aucun village : formulaire de fondation.
  if (view === null) {
    return (
      <>
        {title}
        <div className="panel">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              found(String(new FormData(e.currentTarget).get('name')))
            }}
          >
            <label htmlFor="name">Nommez votre village</label>
            <input id="name" name="name" required minLength={2} maxLength={30} />
            <button type="submit">Fonder</button>
            {error && <p className="error">{error}</p>}
          </form>
        </div>
      </>
    )
  }

  // Village fondé : stock extrapolé à l'instant courant, puis bâtiments.
  const stock = stockAt(view, now)
  return (
    <>
      {title}
      <section className="panel stock" aria-label="Ressources">
        {RESOURCES.map((r) => (
          <div key={r}>
            <Entity kind={r} /> {Math.floor(stock[r])}
            <small>+{view.ratesPerMinute[r]} / min</small>
          </div>
        ))}
      </section>
      <section className="panel buildings" aria-label="Bâtiments">
        {BUILDINGS.map((b) => {
          const cost = view.nextCosts[b]
          return (
            <div key={b} className="building">
              <span>
                <Entity kind={b} showLabel /> <span className="muted">niveau {view.levels[b]}</span>
              </span>
              <span className="row">
                {cost &&
                  Object.entries(cost).map(([r, n]) => (
                    <span key={r} className="muted">
                      <Entity kind={r} /> {n}
                    </span>
                  ))}
                <button type="button" disabled={!canAfford(stock, cost)} onClick={() => upgrade(b)}>
                  {view.levels[b] === 0 ? 'Construire' : 'Améliorer'}
                </button>
              </span>
            </div>
          )
        })}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  )
}
