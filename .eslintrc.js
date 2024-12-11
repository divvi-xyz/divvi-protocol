module.exports = {
  // Not extending @valora/eslint-config-typescript
  // because it pulls react and jest which we don't want here
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  settings: {
    'import/resolver': {
      typescript: true,
    },
  },
}
