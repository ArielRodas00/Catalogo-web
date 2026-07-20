const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    ignores: ['node_modules/**', 'public/uploads/**'],
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
  prettierConfig,
];
