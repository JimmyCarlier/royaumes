/**
 * Variables partagées par les routes de l'API, dans le contexte Hono.
 * userId identifie le joueur à l'origine de la requête.
 */
export interface AppEnv {
  Variables: { userId: string }
}
