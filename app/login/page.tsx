'use client'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { HealthStatus } from '@/modules/system/ui'
import { authClient } from '@/platform/auth/client'
import { Entity } from '@/ui/entity'

/**
 * Messages affichés pour les erreurs renvoyées par Better Auth.
 * Le message d'origine, en anglais, n'est jamais affiché tel quel.
 */
const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Adresse ou mot de passe incorrect.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Cette adresse est déjà utilisée.',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit comporter au moins 8 caractères.',
  VALIDATION_ERROR: 'Saisie invalide.',
}

/** Message d'erreur à partir de la réponse de Better Auth. */
function messageFor(error: { code?: string; status: number }): string {
  if (error.status === 429) return 'Trop de tentatives : réessayez dans une minute.'
  return (error.code && ERRORS[error.code]) || 'La connexion a échoué.'
}

/** Page de connexion et de création de compte. */
export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))

    setPending(true)
    setError(null)
    // Le client appelle /api/auth/sign-up/email ou /api/auth/sign-in/email.
    // En cas de succès, le serveur dépose le cookie de session dans le navigateur.
    const result =
      mode === 'signUp'
        ? await authClient.signUp.email({ email, password, name: String(form.get('name')) })
        : await authClient.signIn.email({ email, password })
    setPending(false)

    if (result.error) setError(messageFor(result.error))
    else router.push('/village')
  }

  return (
    <>
      <h1>
        <Entity kind="village" /> Royaumes
      </h1>
      <p className="muted">{mode === 'signIn' ? 'Connexion' : 'Création de compte'}</p>
      <div className="panel">
        <form onSubmit={submit}>
          {mode === 'signUp' && (
            <input name="name" placeholder="Pseudo" required minLength={2} maxLength={30} />
          )}
          <input
            name="email"
            type="email"
            placeholder="Adresse électronique"
            required
            autoComplete="email"
          />
          <input
            name="password"
            type="password"
            placeholder="Mot de passe (8 caractères minimum)"
            required
            minLength={8}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          />
          <button type="submit" disabled={pending}>
            {mode === 'signIn' ? 'Se connecter' : 'Créer mon compte'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
        <p>
          <button
            className="link"
            type="button"
            onClick={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn')
              setError(null)
            }}
          >
            {mode === 'signIn' ? 'Pas de compte ? En créer un' : 'Déjà un compte ? Se connecter'}
          </button>
        </p>
      </div>
      <HealthStatus />
    </>
  )
}
