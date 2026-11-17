import antfu from '@antfu/eslint-config';

export default antfu({
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },
  lessOpinionated: true,
  ignores: [
    'node_modules',
    'dist',
    // Documentation is markdown with code examples that should not be linted.
    '**/*.md',
    // GitHub workflows (YAML).
    '.github/**',
    // Each skill's bundled UI bundle is hand-written vanilla browser JS/CSS
    // served verbatim to the page; it is not part of the TS program and uses
    // browser globals, so it is out of scope for repo-level lint rules.
    'skills/*/cli/ui/**',
    // Vendored third-party browser libraries and fonts (Rough.js, Mediabunny, woff2): not our code.
    'skills/explain/vendor/**',
  ],
  rules: {
    'no-console': 'off',
    'ts/explicit-function-return-type': 'off',
    'ts/explicit-module-boundary-types': 'off',
    'ts/no-explicit-any': 'warn',
    // Disabled to match the config the CLI was authored against: the platform
    // switch in index.ts has a default branch, and the tool favours direct
    // truthiness checks over explicit nullish/empty comparisons.
    'ts/switch-exhaustiveness-check': 'off',
    'ts/strict-boolean-expressions': 'off',
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/process': 'off',
    'style/semi': ['error', 'always'],
    'style/quotes': ['error', 'single'],
    'style/comma-dangle': ['error', 'always-multiline'],
    'style/max-statements-per-line': 'off',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
  },
}, {
  // The explain engine is plain browser JS imported untyped (see skills/explain/engine/shims.d.ts),
  // so type-aware "unsafe any" rules cannot say anything useful about the code that drives it.
  files: ['skills/explain/**/*.test.ts', 'skills/explain/engine/stub-ctx.ts'],
  rules: {
    'ts/no-unsafe-argument': 'off',
    'ts/no-unsafe-assignment': 'off',
    'ts/no-unsafe-call': 'off',
    'ts/no-unsafe-member-access': 'off',
    'ts/no-unsafe-return': 'off',
  },
});
