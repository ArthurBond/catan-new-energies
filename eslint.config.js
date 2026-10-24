import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'dist-server', 'saves', 'node_modules', '.agents', '.claude', 'handover'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts (asset generators) run outside the browser
    files: ['scripts/**/*.mjs', 'e2e-online/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
