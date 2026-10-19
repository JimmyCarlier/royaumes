import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PGlite (PostgreSQL compilé en WebAssembly) et le pilote pg doivent être chargés
  // tels quels par Node.js, et non intégrés au code produit par la construction.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
}

export default nextConfig
