import js from '@eslint/js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      'cases/**',
      'dist/**',
      'node_modules/**',
      '.oldcodebase/**',
      '.playwright-browsers/**',
      '.tmp/**',
      'playwright-report/**',
      'tasks/**',
      'test-results/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        chrome: 'readonly',
        __TRACE_MESSAGES__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      security,
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-irregular-whitespace': 'off',
      'no-useless-escape': 'off',
      'no-console': 'off',
      'prefer-const': 'off',
      'max-lines': [
        'warn',
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'max-lines-per-function': [
        'warn',
        {
          max: 50,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'security/detect-bidi-characters': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'warn',
    },
  },
  {
    files: ['apps/extension/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/extension/src/**/*.test.{ts,tsx}',
      'apps/extension/src/**/*.spec.{ts,tsx}',
      'apps/extension/src/**/*.d.ts',
      'packages/*/src/**/*.test.{ts,tsx}',
      'packages/*/src/**/*.spec.{ts,tsx}',
      'packages/*/src/**/*.d.ts',
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
    },
  },
  {
    files: [
      'apps/extension/src/popup/**/*.{ts,tsx}',
      'apps/extension/src/editor/**/*.{ts,tsx}',
      'apps/extension/src/background/**/*.{ts,tsx}',
      'apps/extension/src/{composition,contracts,features,foundation,platform,ui,workflows}/**/*.{ts,tsx}',
      'packages/*/src/**/*.{ts,tsx}',
      'apps/extension/src/video-editor/**/*.{ts,tsx}',
      'apps/extension/src/offscreen/**/*.{ts,tsx}',
      'apps/extension/src/content/**/*.{ts,tsx}',
    ],
    ignores: [
      'apps/extension/src/**/*.test.{ts,tsx}',
      'apps/extension/src/**/*.spec.{ts,tsx}',
      'apps/extension/src/**/*.d.ts',
      'packages/*/src/**/*.test.{ts,tsx}',
      'packages/*/src/**/*.spec.{ts,tsx}',
      'packages/*/src/**/*.d.ts',
    ],
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: [
      'apps/extension/src/contracts/**/*.{ts,tsx}',
      'packages/runtime-contracts/src/**/*.{ts,tsx}',
    ],
    ignores: [
      'apps/extension/src/**/*.test.{ts,tsx}',
      'apps/extension/src/**/*.spec.{ts,tsx}',
      'packages/*/src/**/*.test.{ts,tsx}',
      'packages/*/src/**/*.spec.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Shared contracts and video type owners must use const objects plus union types instead of enums.',
        },
      ],
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
      'no-var': 'off',
    },
  },
  {
    files: ['**/*.data.ts'],
    rules: {
      'max-lines': 'off',
    },
  },
  {
    files: ['tooling/test/e2e/**/*.{ts,tsx}'],
    rules: {
      'no-empty-pattern': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      security,
    },
    rules: {
      'no-console': 'off',
      'prefer-const': 'off',
      'max-lines': [
        'warn',
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'max-lines-per-function': [
        'warn',
        {
          max: 50,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
      'security/detect-bidi-characters': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'warn',
    },
  },
  prettierConfig
);
