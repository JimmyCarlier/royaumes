'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RESOURCES, type Resource } from '@/modules/realm/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { look } from '@/ui/theme'
import type { MarketApi } from './api'
import {
  type Amounts,
  MARKET_CHANNEL,
  type MarketList,
  type OfferError,
  type OfferStatus,
  type OfferView,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<MarketApi>('/api/market')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Libellé de chaque état d'une offre. */
const OFFER_STATUS: Record<OfferStatus, string> = {
  reserving: 'Réservation en cours',
  open: 'Ouverte',
  settling: 'Règlement en cours',
  completed: 'Échange conclu',
  rejected: 'Refusée : stock insuffisant',
  withdrawn: 'Retirée',
}

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<OfferError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Saisie invalide.',
  OFFER_NOT_FOUND: 'Offre introuvable.',
  ALREADY_EXISTS: 'Offre déjà publiée.',
  NOT_OPEN: "L'offre n'est plus disponible.",
  OWN_OFFER: 'Vous ne pouvez pas accepter votre propre offre.',
  NOT_SELLER: 'Seul le vendeur peut retirer son offre.',
  EXPIRED: "L'offre a expiré.",
  NOT_EXPIRED: "L'offre n'a pas expiré.",
}

/** Délai entre deux relectures, et nombre maximal de relectures, comme pour le Classement. */
const RETRY_MS = 1_000
const MAX_READS = 10

/** Affiche des quantités de ressources : « 60 bois, 30 pierre ». */
function AmountsText({ amounts }: { amounts: Amounts }) {
  return (
    <>
      {Object.entries(amounts).map(([resource, amount], index) => (
        <span key={resource}>
          {index > 0 && ', '}
          {amount} <Entity kind={resource} />
        </span>
      ))}
    </>
  )
}

/** Compte rendu d'une commande, à partir de la vue de l'offre renvoyée par l'API. */
function outcomeOf(view: OfferView): string {
  if (view.missing && view.status === 'open') {
    const missing = Object.entries(view.missing)
      .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
      .join(', ')
    return `Paiement refusé : il vous manque ${missing}.`
  }
  return OFFER_STATUS[view.status]
}

/** Écran du Marché : publication d'une offre, offres du joueur et offres des autres joueurs. */
export function MarketScreen() {
  const [list, setList] = useState<MarketList | undefined>(undefined)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  // Formulaire de publication : une ressource cédée et une ressource demandée.
  const [give, setGive] = useState<{ resource: Resource; amount: number }>({
    resource: 'wood',
    amount: 50,
  })
  const [want, setWant] = useState<{ resource: Resource; amount: number }>({
    resource: 'stone',
    amount: 25,
  })

  // REQUÊTE : la consultation distribue la boîte d'envoi, puis rattrape la projection.
  const refresh = useCallback(async () => {
    const res = await client.offers.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setList(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : même mécanisme que le Classement (TD8), la liste est relue jusqu'à ce que
  // la projection ait atteint la position de l'événement annoncé.
  const wanted = useRef(0)
  const following = useRef(false)
  const status = useChannel(MARKET_CHANNEL, async (event) => {
    wanted.current = Math.max(wanted.current, event.position)
    if (following.current) return
    following.current = true
    try {
      for (let read = 0; read < MAX_READS; read++) {
        if ((await refresh()) >= wanted.current) return
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
      }
    } finally {
      following.current = false
    }
  })

  // COMMANDES : chaque réponse contient la vue de l'offre, ou une erreur.
  async function handle(res: Response) {
    const body = (await res.json()) as { view: OfferView } | { error: { code: string } }
    if ('error' in body) {
      setMessage({ text: ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Erreur.', error: true })
    } else {
      setMessage({ text: outcomeOf(body.view), error: body.view.status === 'rejected' })
    }
    await refresh()
  }

  const publish = async () =>
    handle(
      await client.offers.$post({
        json: { give: { [give.resource]: give.amount }, want: { [want.resource]: want.amount } },
      }),
    )
  const acceptOffer = async (id: string) =>
    handle(await client.offers[':id'].accept.$post({ param: { id } }))
  const withdrawOffer = async (id: string) =>
    handle(await client.offers[':id'].withdraw.$post({ param: { id } }))

  const mine = list?.offers.filter((offer) => offer.mine) ?? []
  const others = list?.offers.filter((offer) => !offer.mine) ?? []

  /** Sélecteur d'une ressource et de sa quantité. */
  const picker = (
    label: string,
    value: { resource: Resource; amount: number },
    onChange: (value: { resource: Resource; amount: number }) => void,
  ) => (
    <>
      <label htmlFor={`${label}-amount`}>{label}</label>
      <input
        id={`${label}-amount`}
        className="amount"
        type="number"
        min={1}
        value={value.amount}
        onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })}
      />
      <select
        aria-label={`Ressource : ${label}`}
        value={value.resource}
        onChange={(e) => onChange({ ...value, resource: e.target.value as Resource })}
      >
        {RESOURCES.map((resource) => (
          <option key={resource} value={resource}>
            {look(resource).label}
          </option>
        ))}
      </select>
    </>
  )

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>
          <Entity kind="market" /> Marché
        </h1>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="panel row">
        {picker('Je cède', give, setGive)}
        {picker('contre', want, setWant)}
        <button type="button" onClick={publish}>
          Publier l'offre
        </button>
      </div>
      {message && (
        <p className={message.error ? 'error' : 'muted'} role="status">
          {message.text}
        </p>
      )}

      <section className="panel" aria-label="Vos offres">
        <h2>Vos offres</h2>
        {mine.length === 0 && <p className="muted">Aucune offre en cours.</p>}
        <ul className="offers">
          {mine.map((offer) => (
            <li key={offer.offerId}>
              <span>
                <AmountsText amounts={offer.give} /> contre <AmountsText amounts={offer.want} />{' '}
                <span className="muted">({OFFER_STATUS[offer.status]})</span>
              </span>
              {offer.status === 'open' && (
                <button type="button" onClick={() => withdrawOffer(offer.offerId)}>
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-label="Offres des autres joueurs">
        <h2>Offres des autres joueurs</h2>
        {others.length === 0 && <p className="muted">Aucune offre disponible.</p>}
        <ul className="offers">
          {others.map((offer) => (
            <li key={offer.offerId}>
              <span>
                {offer.sellerName} cède <AmountsText amounts={offer.give} /> contre{' '}
                <AmountsText amounts={offer.want} />
              </span>
              <button type="button" onClick={() => acceptOffer(offer.offerId)}>
                Accepter
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
