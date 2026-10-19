'use client'
import { createAuthClient } from 'better-auth/react'

/**
 * Client d'authentification destiné au navigateur.
 * Il appelle les routes /api/auth/* de l'application, sur le même domaine,
 * et ne contient aucun code serveur : c'est la seule partie de la plateforme
 * que le code client est autorisé à importer.
 */
export const authClient = createAuthClient()
