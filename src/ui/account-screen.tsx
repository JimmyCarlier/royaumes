'use client'
import { useState } from 'react'

/** Phrase que le joueur doit saisir pour confirmer la suppression de son compte. */
const CONFIRMATION = 'SUPPRIMER'

/**
 * Écran « Mes données » : export des données personnelles, et suppression du compte.
 * Il n'appartient à aucun module : les droits du joueur portent sur le jeu entier.
 */
export function AccountScreen() {
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Droit d'accès et à la portabilité : le navigateur télécharge le fichier JSON,
  // grâce à l'en-tête Content-Disposition renvoyé par l'API.
  const exportUrl = '/api/account/export'

  // Droit à l'effacement. La suppression est irréversible : elle n'est envoyée qu'après
  // la saisie de la phrase de confirmation.
  async function erase() {
    setBusy(true)
    const res = await fetch('/api/account', { method: 'DELETE' })
    if (res.ok) {
      // Le compte et ses sessions n'existent plus : retour à la page de connexion.
      window.location.href = '/login'
    } else {
      setBusy(false)
      setError("La suppression n'a pas abouti. Vous pouvez la relancer.")
    }
  }

  return (
    <>
      <h1>Mes données</h1>

      <section className="panel" aria-label="Exporter mes données">
        <h2>Exporter mes données</h2>
        <p>
          Téléchargez, au format JSON, l'ensemble des données que le jeu conserve à votre sujet :
          compte, village, expéditions, offres, messages et classement.
        </p>
        <a className="button" href={exportUrl} download>
          Télécharger mes données
        </a>
      </section>

      <section className="panel" aria-label="Supprimer mon compte">
        <h2>Supprimer mon compte</h2>
        <p>
          Votre compte, vos messages et votre présence dans la Taverne sont supprimés. Votre nom et
          celui de votre village sont remplacés partout ailleurs par une mention neutre. Cette
          opération est irréversible.
        </p>
        <div className="row">
          <label htmlFor="confirmation">Saisissez {CONFIRMATION} pour confirmer</label>
          <input
            id="confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
          <button type="button" disabled={busy || confirmation !== CONFIRMATION} onClick={erase}>
            Supprimer mon compte
          </button>
        </div>
        {error && (
          <p className="error" role="status">
            {error}
          </p>
        )}
      </section>
    </>
  )
}
