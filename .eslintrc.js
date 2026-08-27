module.exports = {
  root: true,
  extends: ['expo'],
  env: { es2021: true },
  // React Native's runtime globals. Declared explicitly rather than claiming a
  // browser env, which this is not.
  globals: {
    __DEV__: 'readonly',
    fetch: 'readonly',
    Headers: 'readonly',
    Request: 'readonly',
    Response: 'readonly',
    FormData: 'readonly',
    AbortController: 'readonly',
    AbortSignal: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    console: 'readonly',
  },
  rules: {
    // Was a silent source of real bugs: a useFocusEffect with empty deps kept
    // showing the previously signed-in user's wallet. Error, not warning.
    'react-hooks/exhaustive-deps': 'error',
    'react-hooks/rules-of-hooks': 'error',
    // Catches importing a name a module does not export — how PaymentScreen
    // shipped a crash on mount.
    'import/no-unresolved': 'error',
    'import/named': 'error',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // A stray console.log is how an auth token reached the device log.
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      // Build tooling: plain CommonJS run by Node, not bundled into the app.
      files: ['scripts/**/*.js', '*.config.js', '.eslintrc.js', 'jest.setup.js'],
      env: { node: true },
      rules: { 'no-console': 'off' },
    },
    {
      files: ['**/__tests__/**/*.js', 'jest.setup.js'],
      env: { jest: true },
      rules: {
        // Tests declare jest.mock() before importing the module under test so
        // the mock is in place at import time. That reads as "imports not at
        // the top", but it is the required order.
        'import/first': 'off',
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'backend/', '.expo/', 'dist/'],
};
