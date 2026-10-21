import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'e2e/screenshots', 'exemple', 'docs', '.claude', 'ref-externe', 'supabase/functions/game/index.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // plain Node scripts
    files: ['tools/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
