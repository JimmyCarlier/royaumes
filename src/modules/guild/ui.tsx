'use client'
import { hc } from 'hono/client'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { GuildApi } from './api'
import {
  type GuildError,
  type GuildRanking,
  type GuildView,
  guildChannel,
  type MyGuild,
  NAME_MAX,
  NAME_MIN,
  UPGRADE_POINTS,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<GuildApi>('/api/guild')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Message affiché au joueur pour chaque erreur. */
function errorText(error: GuildError | { code: 'INVALID_INPUT' }): string {
  switch (error.code) {
    case 'INVALID_NAME':
      return `Le nom doit comporter de ${error.min} à ${error.max} caractères.`
    case 'NAME_TAKEN':
      return 'Une guilde porte déjà ce nom.'
    case 'ALREADY_MEMBER':
      return 'Ce joueur appartient déjà à une guilde.'
    case 'NOT_A_MEMBER':
      return "Vous n'appartenez à aucune guilde."
    case 'GUILD_NOT_FOUND':
      return "Cette guilde n'existe plus."
    case 'GUILD_FULL':
      return `La guilde est complète (${error.max} membres).`
    case 'REQUEST_PENDING':
      return 'Vous avez déjà une demande en attente.'
    case 'NO_PENDING_REQUEST':
      return "Vous n'avez aucune demande en attente."
    case 'REQUEST_NOT_FOUND':
      return "Cette demande n'existe plus."
    case 'REQUEST_EXPIRED':
      return 'Cette demande a expiré.'
    case 'NOT_LEADER':
      return 'Seul le chef de la guilde peut le faire.'
    case 'CANNOT_KICK_SELF':
      return 'Le chef ne peut pas s’exclure lui-même : il peut quitter la guilde.'
    case 'MEMBER_NOT_FOUND':
      return "Ce joueur n'est pas membre de la guilde."
    case 'INVALID_INPUT':
      return 'Saisie invalide.'
  }
}

/** Date et heure, au format local. */
const dateOf = (at: number) =>
  new Date(at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/** Écran des Guildes : la guilde du joueur, ou la fondation et les demandes, puis le classement. */
export function GuildScreen() {
  // undefined : chargement en cours.
  const [mine, setMine] = useState<MyGuild | undefined>(undefined)
  const [ranking, setRanking] = useState<GuildRanking['entries']>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // REQUÊTES : la situation du joueur et le classement.
  const refresh = useCallback(async () => {
    const [me, guilds] = await Promise.all([client.me.$get(), client.guilds.$get()])
    if (me.ok) setMine(await me.json())
    if (guilds.ok) setRanking((await guilds.json()).entries)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : le canal de la guilde annonce chaque changement, sans données ; la situation
  // est alors relue. Sans guilde, aucun canal n'est ouvert.
  const guildId = mine?.guild?.id ?? null
  const status = useChannel(guildId ? guildChannel(guildId) : null, () => {
    refresh()
  })

  /** Traite la réponse d'une commande : la situation à jour, ou l'erreur. */
  async function handle(res: Response) {
    const body = (await res.json()) as MyGuild | { error: GuildError }
    if ('error' in body) {
      setError(errorText(body.error))
      return
    }
    setError(null)
    setMine(body)
    const guilds = await client.guilds.$get()
    if (guilds.ok) setRanking((await guilds.json()).entries)
  }

  // COMMANDES.
  async function found(event: FormEvent) {
    event.preventDefault()
    await handle(await client.guilds.$post({ json: { name } }))
    setName('')
  }
  const ask = async (id: string) =>
    handle(await client.guilds[':id'].requests.$post({ param: { id } }))
  const cancel = async () => handle(await client.requests.mine.$delete())
  const accept = async (id: string) =>
    handle(await client.requests[':id'].accept.$post({ param: { id } }))
  const refuse = async (id: string) =>
    handle(await client.requests[':id'].refuse.$post({ param: { id } }))
  const kick = async (playerId: string) =>
    handle(await client.members[':playerId'].kick.$post({ param: { playerId } }))
  const leave = async () => handle(await client.leave.$post())

  const title = (
    <h1>
      <Entity kind="guild" /> Guildes
    </h1>
  )
  if (mine === undefined) return title

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {title}
        {guildId && (
          <span className="status" data-status={status}>
            {STATUS_LABELS[status]}
          </span>
        )}
      </div>

      {mine.guild ? (
        <MyGuildPanel
          guild={mine.guild}
          onAccept={accept}
          onRefuse={refuse}
          onKick={kick}
          onLeave={leave}
        />
      ) : (
        <section className="panel" aria-label="Fonder une guilde">
          {mine.request ? (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                Demande envoyée à <strong>{mine.request.guildName}</strong>, valable jusqu'au{' '}
                {dateOf(mine.request.expiresAt)}.
              </span>
              <button type="button" onClick={cancel}>
                Retirer ma demande
              </button>
            </div>
          ) : (
            <p className="muted">
              Vous n'appartenez à aucune guilde. Fondez la vôtre, ou demandez à en rejoindre une.
            </p>
          )}
          <form className="row" onSubmit={found} style={{ marginTop: 12 }}>
            <label htmlFor="guild-name">Nom de la guilde</label>
            <input
              id="guild-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={NAME_MIN}
              maxLength={NAME_MAX}
              required
            />
            <button type="submit">Fonder</button>
          </form>
        </section>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="panel" aria-label="Classement des guildes">
        <h2>
          <Entity kind="ranking" /> Classement des guildes
        </h2>
        <p className="muted">
          Score : l'or rapporté du Donjon par les membres, plus {UPGRADE_POINTS} points par
          amélioration de bâtiment.
        </p>
        {ranking.length === 0 && <p className="muted">Aucune guilde pour le moment.</p>}
        <ul className="games">
          {ranking.map((entry) => (
            <li key={entry.id}>
              <span>
                {entry.rank}. <strong>{entry.name}</strong>{' '}
                <span className="muted">
                  {entry.memberCount} membre{entry.memberCount > 1 ? 's' : ''}
                </span>
              </span>
              <span className="row">
                {entry.score} points
                {!mine.guild && !mine.request && (
                  <button type="button" disabled={entry.full} onClick={() => ask(entry.id)}>
                    {entry.full ? 'Complète' : 'Demander à rejoindre'}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

/** Guilde du joueur : membres, demandes reçues pour le chef, et départ. */
function MyGuildPanel({
  guild,
  onAccept,
  onRefuse,
  onKick,
  onLeave,
}: {
  guild: GuildView
  onAccept: (id: string) => void
  onRefuse: (id: string) => void
  onKick: (playerId: string) => void
  onLeave: () => void
}) {
  return (
    <section className="panel" aria-label="Ma guilde">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>{guild.name}</h2>
        <strong>{guild.score} points</strong>
      </div>

      <h3>
        Membres ({guild.members.length}/{guild.maxMembers})
      </h3>
      <ul className="games">
        {guild.members.map((member) => (
          <li key={member.playerId}>
            <span>
              {member.name} {member.role === 'leader' && <span className="ok">chef</span>}
            </span>
            <span className="row">
              <span className="muted">{member.points} points</span>
              {guild.isLeader && member.role !== 'leader' && (
                <button type="button" onClick={() => onKick(member.playerId)}>
                  Exclure
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {guild.isLeader && (
        <>
          <h3>Demandes reçues</h3>
          {guild.requests.length === 0 && <p className="muted">Aucune demande en attente.</p>}
          <ul className="games">
            {guild.requests.map((request) => (
              <li key={request.id}>
                <span>
                  {request.playerName}{' '}
                  <span className="muted">expire le {dateOf(request.expiresAt)}</span>
                </span>
                <span className="row">
                  <button type="button" onClick={() => onAccept(request.id)}>
                    Accepter
                  </button>
                  <button type="button" onClick={() => onRefuse(request.id)}>
                    Refuser
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" onClick={onLeave}>
          Quitter la guilde
        </button>
        {guild.isLeader && guild.members.length > 1 && (
          <span className="muted">Le plus ancien membre deviendra chef.</span>
        )}
        {guild.members.length === 1 && (
          <span className="muted">Vous êtes le dernier membre : la guilde sera dissoute.</span>
        )}
      </div>
    </section>
  )
}
