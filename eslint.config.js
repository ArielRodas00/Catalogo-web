const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    // _tmp-*.js: scripts de un solo uso (ej. capturas con Playwright) que no se
    // pudieron borrar por una restricción de permisos del entorno (ver AUDITORIA.md).
    // **/node_modules/**: cubre tanto el node_modules raíz como el propio de
    // panel-central/ (es un sub-proyecto con su package.json separado).
    ignores: ['**/node_modules/**', 'public/uploads/**', '_tmp-*.js'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    // El catálogo público (public/js/*.js + storage.js) se carga como <script> planos,
    // sin módulos: cada archivo declara variables/funciones de nivel superior que las
    // demás consumen del mismo scope global del navegador (patrón intencional, ver
    // AUDITORIA.md). No podemos activar no-undef ahí sin generar cientos de falsos
    // positivos por ese acoplamiento entre archivos.
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  {
    // panel-central/public: un único archivo app.js (no varios <script>
    // hermanos compartiendo scope como el catálogo), así que no hace falta
    // apagar no-undef acá — sigue siendo útil para atrapar typos.
    files: ['panel-central/public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
  },
  prettierConfig,
];
