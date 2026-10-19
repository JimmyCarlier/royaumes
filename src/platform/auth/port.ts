/**
 * Port d'authentification de la plateforme.
 * Le reste de l'application ne dépend que de ce contrat, et jamais de la bibliothèque
 * qui le met en œuvre : Better Auth en est un adaptateur, les tests en fournissent un autre.
 */
export interface AuthPort {
  /** Traite les requêtes d'authentification (/api/auth/*) : inscription, connexion, déconnexion. */
  handler(request: Request): Promise<Response>

  /** Renvoie l'utilisateur connecté à l'origine d'une requête, ou null s'il n'y en a aucun. */
  getUser(headers: Headers): Promise<AuthUser | null>
}

/** Ce que l'application sait d'un utilisateur connecté. */
export interface AuthUser {
  id: string
  name: string
}
