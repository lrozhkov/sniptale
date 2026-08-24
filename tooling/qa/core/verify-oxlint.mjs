/**
 * Fast syntax and lint-smell gate backed by Oxlint.
 */

import fs from 'node:fs';

import {
  collectContractEnumViolations,
  formatContractEnumViolations,
} from './contract-enum-guard.mjs';
import { createProcessStep, createSkippedStep } from './focused-qa-results.mjs';
import { DEFAULT_SCAN_ROOTS, IGNORED_ROOT_SEGMENTS } from './quality.config.mjs';
import { collectRecursiveFiles } from './recursive-files.mjs';
import {
  fromRelativePath,
  isExecutedAsScript,
  isIgnoredRelativePath,
  parseFilesArgument,
  runRepoNodeEntry,
  toRelativePath,
} from './shared.mjs';

const OXLINT_ENTRY = 'node_modules/oxlint/bin/oxlint';
const JS_LIKE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const OXLINT_IGNORED_ROOT_SEGMENTS = new Set([
  ...IGNORED_ROOT_SEGMENTS,
  '.playwright-browsers',
  '.tmp',
  'playwright-report',
  'test-results',
]);

export const REPO_WIDE_OXLINT_FILES = [
  '.dependency-cruiser.cjs',
  'apps/extension/postcss.config.js',
  'apps/extension/public/popup-theme-paint.js',
  'apps/extension/tailwind.config.js',
  'apps/extension/vite.config.ts',
  'playwright.config.ts',
  'vitest.config.ts',
];
export const DEFAULT_OXLINT_ROOTS = [...DEFAULT_SCAN_ROOTS, ...REPO_WIDE_OXLINT_FILES];
export const OXLINT_CONFIG_PATH = '.oxlintrc.json';
export const OXLINT_STRICT_CONFIG_PATH = '.oxlintrc.strict.json';
export const OXLINT_TOOL_VERSION = JSON.parse(
  fs.readFileSync(new URL('../../../node_modules/oxlint/package.json', import.meta.url), 'utf8')
).version;
const FULL_OXLINT_CLOSURE_FILES = new Set([
  OXLINT_CONFIG_PATH,
  OXLINT_STRICT_CONFIG_PATH,
  'package-lock.json',
  'package.json',
  'tooling/configs/qa/lint-rule-migration.data.json',
  'tooling/qa/core/contract-enum-guard.mjs',
  'tooling/qa/core/verify-oxlint.mjs',
]);

export function requiresFullOxlintClosure(targetFiles = []) {
  return targetFiles.some((file) => FULL_OXLINT_CLOSURE_FILES.has(file));
}

function isOxlintIgnored(file) {
  return (
    file.split('/').some((segment) => OXLINT_IGNORED_ROOT_SEGMENTS.has(segment)) ||
    isIgnoredRelativePath(file)
  );
}

function isOxlintFile(file) {
  return JS_LIKE_FILE_PATTERN.test(file) && !isOxlintIgnored(file);
}

function collectOxlintDirectoryFiles(relativePath) {
  return collectRecursiveFiles(fromRelativePath(relativePath), {
    baseDir: process.cwd(),
    ignoredSegments: OXLINT_IGNORED_ROOT_SEGMENTS,
    predicate: isOxlintFile,
  });
}

export function collectOxlintFiles(files = []) {
  const result = [];
  for (const file of files) {
    const relativePath = toRelativePath(file);
    if (isOxlintIgnored(relativePath)) {
      continue;
    }

    const absolutePath = fromRelativePath(relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    if (fs.statSync(absolutePath).isDirectory()) {
      result.push(...collectOxlintDirectoryFiles(relativePath));
      continue;
    }

    if (isOxlintFile(relativePath)) {
      result.push(relativePath);
    }
  }

  return [...new Set(result)].sort();
}

export function createOxlintArgs(
  targetFiles,
  { fix = false, strictSecurity = false, threads = null } = {}
) {
  return [
    '--config',
    strictSecurity ? OXLINT_STRICT_CONFIG_PATH : OXLINT_CONFIG_PATH,
    ...(fix ? ['--fix'] : []),
    ...(threads === null ? [] : [`--threads=${threads}`]),
    '--deny-warnings',
    '--format',
    'unix',
    ...targetFiles,
  ];
}

function appendContractEnumResult(commandResult, violations) {
  if (violations.length === 0) {
    return commandResult;
  }

  const contractOutput = formatContractEnumViolations(violations);
  return {
    ...commandResult,
    status: commandResult.status === 0 ? 1 : commandResult.status,
    stderr: [commandResult.stderr, contractOutput].filter(Boolean).join('\n'),
  };
}

export function runOxlint({
  files = [],
  fix = false,
  strictSecurity = false,
  threads = null,
  commandRunner = runRepoNodeEntry,
  contractEnumCollector = collectContractEnumViolations,
} = {}) {
  if (threads !== null && (!Number.isInteger(threads) || threads < 1)) {
    throw new Error('Oxlint threads must be a positive integer.');
  }
  const targetFiles = collectOxlintFiles(files);
  if (targetFiles.length === 0) {
    return {
      skipped: true,
      step: createSkippedStep('Oxlint'),
    };
  }

  const contractEnumViolations = contractEnumCollector(targetFiles);
  const commandResult = commandRunner(
    OXLINT_ENTRY,
    createOxlintArgs(targetFiles, { fix, strictSecurity, threads }),
    { stdio: 'pipe' }
  );
  return {
    contractEnumViolations,
    skipped: false,
    step: createProcessStep(
      'Oxlint',
      appendContractEnumResult(commandResult, contractEnumViolations)
    ),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const files = parseFilesArgument(argv);
  const result = runOxlint({
    files: files.length > 0 ? files : DEFAULT_OXLINT_ROOTS,
    fix: argv.includes('--fix'),
  });
  const { step } = result;

  if (step.status === 'failed') {
    if (step.stdout) {
      process.stdout.write(step.stdout);
    }
    if (step.stderr) {
      process.stderr.write(step.stderr);
    }
    process.exit(step.exitCode ?? 1);
  }

  process.stdout.write(result.skipped ? 'Oxlint skipped: no matching files\n' : 'Oxlint passed\n');
}
