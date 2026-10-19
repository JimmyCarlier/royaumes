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
  },
})
