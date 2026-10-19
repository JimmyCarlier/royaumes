/**
 * Variables partagées par les routes de l'API, dans le contexte Hono.
 * Elles sont renseignées par l'intergiciel requireUser, une fois le joueur identifié.
 */
export interface AppEnv {
  Variables: { userId: string; userName: string }
}
