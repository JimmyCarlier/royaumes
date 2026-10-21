/**
 * Règles d'architecture du projet (fonctions d'aptitude).
 * La vérification échoue dès qu'une importation enfreint l'une d'elles.
 *
 * Un module est un répertoire src/modules/<nom>/. Seules ses entrées publiques
 * (index.ts, contracts.ts et ui.tsx) peuvent être importées depuis l'extérieur.
 */
const PUBLIC_ENTRIES = '^src/modules/[^/]+/(index\\.ts|contracts\\.ts|ui\\.tsx)$'

module.exports = {
  forbidden: [
    {
      // Règle 1, vue depuis un module : il n'atteint un autre module que par ses entrées publiques.
      // « $1 » reprend le nom du module d'origine, capturé dans « from ».
      name: 'module-encapsulation',
      comment:
        "Un module n'importe jamais l'intérieur d'un autre module, seulement ses entrées publiques.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/[^/]+/', pathNot: ['^src/modules/$1/', PUBLIC_ENTRIES] },
    },
    {
      // Règle 1, vue depuis le reste du projet (pages, racine de composition, plateforme).
      name: 'outside-uses-public-entries',
      comment: "Hors des modules, on n'importe que les entrées publiques d'un module.",
      severity: 'error',
      from: { pathNot: '^src/modules/' },
      to: { path: '^src/modules/', pathNot: PUBLIC_ENTRIES },
    },
    {
      // Règle 2 : le domaine ne dépend que de lui-même (ni base, ni HTTP, ni bibliothèque).
      name: 'pure-domain',
      comment: "Le domaine d'un module n'importe que son propre répertoire domain/.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: { pathNot: '^src/modules/$1/domain/' },
    },
    {
      // Règle 2 bis : la couche application ne dépend que du domaine et de ses propres ports,
      // jamais des adaptateurs de l'infrastructure (architecture hexagonale).
      name: 'application-ignores-infrastructure',
      comment: "La couche application d'un module n'importe jamais son infrastructure.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/application/' },
      to: { path: '^src/modules/$1/infrastructure/' },
    },
    {
      // Règle 3 : la plateforme est générique et ignore les modules métier.
      name: 'platform-ignores-modules',
      comment:
        'La plateforme technique ne connaît aucun module métier ni la racine de composition.',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/(modules|bootstrap)/' },
    },
    {
      // Règle 4 : le code exécuté dans le navigateur n'embarque aucun code serveur.
      // Les importations de types sont autorisées : elles disparaissent à la compilation.
      name: 'client-without-server-code',
      comment:
        "Le code client (ui.tsx, src/ui) n'importe jamais de code serveur ; seuls les types sont autorisés.",
      severity: 'error',
      from: { path: '(^src/modules/[^/]+/ui\\.tsx$)|(^src/ui/)' },
      to: {
        path: '^src/(platform/|bootstrap/|modules/[^/]+/(api\\.ts|index\\.ts|application/|infrastructure/))',
        // Seules exceptions : les fichiers de la plateforme écrits pour le navigateur.
        pathNot: ['^src/platform/auth/client\\.ts$', '^src/platform/realtime/use-channel\\.ts$'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      // Règle 5 : aucune dépendance circulaire.
      name: 'no-circular',
      comment: 'Deux fichiers ne doivent jamais dépendre, même indirectement, l’un de l’autre.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      // Règle 6 (TD11) : les tables de la plateforme ne sont lues et écrites que par la plateforme.
      // Un module passe par les fonctions du journal, de la boîte d'envoi ou des projections ;
      // il n'importe jamais leurs tables. Seule la plateforme peut ainsi modifier un événement.
      name: 'platform-tables-are-private',
      comment:
        "Un module n'importe jamais les tables de la plateforme : il passe par ses fonctions.",
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { path: '^src/platform/[^/]+/schema\\.ts$' },
    },
  ],
  options: {
    // Les paquets installés ne sont pas analysés.
    doNotFollow: { path: 'node_modules' },
    // Les tests peuvent importer librement le code qu'ils testent.
    exclude: { path: '\\.test\\.ts$' },
    // Les importations de types sont prises en compte, pour pouvoir les distinguer.
    tsPreCompilationDeps: true,
    // L'alias « @/ » est résolu à partir de tsconfig.json.
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}
