import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Même alias que dans tsconfig.json : « @/ » désigne le répertoire src/.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    // Les tests s'exécutent dans Node.js, sans navigateur simulé.
    environment: 'node',
    // Seuls les fichiers de test placés dans src/ sont exécutés.
    include: ['src/**/*.test.ts'],
    // Les tests s'exécutent toujours dans un environnement de test, y compris lorsqu'ils
    // sont lancés par la construction Vercel, où NODE_ENV vaut « production ». Ils ne
    // dépendent ainsi d'aucune variable de l'environnement de production.
    env: { NODE_ENV: 'test' },
    // Chaque fichier de test de l'API démarre sa propre base PGlite : sur un poste chargé,
    // ce démarrage peut dépasser le délai par défaut de cinq secondes.
    testTimeout: 20_000,
    // Couverture du code par les tests (TD11), mesurée par la commande pnpm test:coverage.
    coverage: {
      provider: 'v8',
      // Seul le code du projet est mesuré, hors tests et hors pages Next.js.
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
})
