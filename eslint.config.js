import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        unsafeWindow: 'readonly',
        GM: 'readonly',
        GM_info: 'readonly',
        GM_getValue: 'readonly',
        GM_setValue: 'readonly',
        GM_deleteValue: 'readonly',
        GM_listValues: 'readonly',
        GM_xmlhttpRequest: 'readonly',
        GM_setClipboard: 'readonly',
        GM_addStyle: 'readonly',
        GM_getResourceText: 'readonly',
        GM_getResourceURL: 'readonly',
        GM_registerMenuCommand: 'readonly',
        GM_unregisterMenuCommand: 'readonly',
        GM_openInTab: 'readonly',
        GM_log: 'readonly',
        GM_notification: 'readonly',
        GM_download: 'readonly'
      }
    },
    rules: {
      'curly': ['error', 'all'],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  },
  {
    ignores: ['dist/', 'node_modules/', '.idea/', '.agents/', '*.cjs', 'temp/']
  }
);
