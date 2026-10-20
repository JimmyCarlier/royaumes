'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import type { RankingApi } from './api'
import type { RankingEntry } from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RankingApi>('/api/ranking')

/** Écran du Classement : les meilleurs joueurs, le joueur connecté étant mis en évidence. */
export function RankingScreen({ userId }: { userId: string }) {
  // undefined : chargement en cours.
  const [entries, setEntries] = useState<RankingEntry[] | undefined>(undefined)

  // REQUÊTE : la lecture déclenche, côté serveur, le rattrapage de la projection.
  const refresh = useCallback(async () => {
    const res = await client.players.$get()
    if (res.ok) setEntries((await res.json()).entries)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>
          <Entity kind="ranking" /> Classement
        </h1>
        <button className="link" type="button" onClick={refresh}>
          Actualiser
        </button>
      </div>
      <section className="panel" aria-label="Classement des joueurs">
        {entries?.length === 0 && <p className="muted">Aucun joueur classé pour le moment.</p>}
        {entries && entries.length > 0 && (
          <table className="ranking">
            <thead>
              <tr>
                <th>Rang</th>
                <th>Joueur</th>
                <th>Victoires</th>
                <th>Expéditions</th>
                <th>
                  <Entity kind="gold" />
                </th>
                <th>Meilleur butin</th>
                <th>Améliorations</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.playerId}
                  aria-current={entry.playerId === userId ? 'true' : undefined}
                >
                  <td>{entry.rank}</td>
                  <td>{entry.label}</td>
                  <td>{entry.gamesWon}</td>
                  <td>{entry.gamesPlayed}</td>
                  <td>{entry.gold}</td>
                  <td>{entry.bestLoot}</td>
                  <td>{entry.upgrades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
