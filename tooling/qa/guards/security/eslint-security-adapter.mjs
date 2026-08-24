import { ESLint } from 'eslint';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SECURITY_RULES = Object.freeze({
  'security/detect-bidi-characters': 'error',
  'security/detect-buffer-noassert': 'error',
  'security/detect-eval-with-expression': 'error',
  'security/detect-new-buffer': 'error',
  'security/detect-non-literal-regexp': 'warn',
  'security/detect-object-injection': 'off',
  'security/detect-unsafe-regex': 'warn',
});

function createBaseConfig() {
  return {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        chrome: 'readonly',
      },
      sourceType: 'module',
    },
    plugins: { security },
    rules: SECURITY_RULES,
  };
}

export function createSecurityEslintConfig() {
  return [
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
    { ...createBaseConfig(), files: ['**/*.{js,mjs,cjs}'] },
    {
      ...createBaseConfig(),
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        ...createBaseConfig().languageOptions,
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
  ];
}

function keepBlockingMessage(message, { strictWarnings }) {
  return (
    message.severity === 2 ||
    (message.severity === 1 &&
      (strictWarnings || message.ruleId === 'security/detect-unsafe-regex'))
  );
}

function projectBlockingResults(results, { strictWarnings }) {
  return results
    .map((result) => {
      const messages = result.messages.filter((message) =>
        keepBlockingMessage(message, { strictWarnings })
      );
      return {
        ...result,
        messages,
        errorCount: messages.filter((message) => message.severity === 2).length,
        fatalErrorCount: messages.filter((message) => message.fatal).length,
        warningCount: messages.filter((message) => message.severity === 1).length,
      };
    })
    .filter((result) => result.errorCount > 0 || result.warningCount > 0);
}

export async function lintWithSecurityEslint({ files, strictWarnings = false }) {
  const eslint = new ESLint({
    cache: true,
    cacheLocation: '.tmp/qa/eslint-security-cache',
    cacheStrategy: 'content',
    cwd: process.cwd(),
    errorOnUnmatchedPattern: false,
    overrideConfig: createSecurityEslintConfig(),
    overrideConfigFile: true,
  });
  const results = projectBlockingResults(await eslint.lintFiles(files), { strictWarnings });
  const formatter = await eslint.loadFormatter('stylish');
  const errorCount = results.reduce((count, result) => count + result.errorCount, 0);
  const warningCount = results.reduce((count, result) => count + result.warningCount, 0);

  return {
    errorCount,
    failed: errorCount > 0 || warningCount > 0,
    output: formatter.format(results),
    results,
    warningCount,
  };
}
