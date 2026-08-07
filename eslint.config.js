import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/dist-electron/**', '**/out/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // `**/src/**/*.{ts,tsx}` rather than the more literal `apps/desktop/src/**/*.{ts,tsx}` —
    // empirically, an anchored multi-segment `files` glob (more than one literal path segment
    // before a `**`) makes ESLint 9's inline `eslint-disable-next-line <rule>` validation fail
    // to find rules registered in *this* config block, even though the same rules apply
    // correctly during normal linting (only the disable-comment's own rule-existence check is
    // affected — reproduced in isolation against a minimal config outside this repo's real
    // config, bisected down to glob shape alone: `apps/desktop/src/**/*.{ts,tsx}` and even
    // `**/desktop/src/**/*.{ts,tsx}` both fail, `**/src/**/*.{ts,tsx}` doesn't). Tracked as a
    // real ESLint/typescript-eslint interaction quirk, not fixed upstream by this repo — this is
    // the actual root cause of the `react-hooks/exhaustive-deps` "rule not found" error
    // `TASKS.md` previously attributed to `eslint-plugin-react-hooks` v5's flat-config export
    // shape (that was a red herring; the plugin's `configs.recommended.rules` has always
    // contained the correctly-prefixed rule id). Only `apps/desktop/src` and (once it has real
    // files) `packages/desktop-types/src` exist under any `src/` in this monorepo, so the
    // broadened glob doesn't unintentionally sweep in anything else.
    files: ['**/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    files: ['apps/desktop/electron/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['packages/desktop-types/src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
)
