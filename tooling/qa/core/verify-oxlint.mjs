/**
 * Fast syntax and lint-smell gate backed by Oxlint.
 */

import fs from 'node:fs';

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
  '.tmp',
  'playwright-report',
  'test-results',
]);

export const DEFAULT_OXLINT_ROOTS = DEFAULT_SCAN_ROOTS;
export const BASE_OXLINT_ARGS = ['--react-plugin', '--vitest-plugin', '--jsx-a11y-plugin'];

export const OXLINT_SIZE_RULE_ARGS = ['-D', 'max-lines', '-D', 'max-lines-per-function'];

export const STRICT_OXLINT_ARGS = [
  ...BASE_OXLINT_ARGS,
  ...OXLINT_SIZE_RULE_ARGS,
  '-D',
  'exhaustive-deps',
  '-D',
  'vitest/no-focused-tests',
  '-D',
  'vitest/no-disabled-tests',
  '-D',
  'jsx-a11y/aria-props',
  '-D',
  'jsx-a11y/aria-proptypes',
  '-D',
  'jsx-a11y/aria-role',
  '-D',
  'jsx-a11y/aria-unsupported-elements',
  '-D',
  'jsx-a11y/role-has-required-aria-props',
  '-D',
  'jsx-a11y/role-supports-aria-props',
  '-D',
  'jsx-a11y/alt-text',
  '-D',
  'jsx-a11y/no-aria-hidden-on-focusable',
  '-D',
  'react/jsx-no-target-blank',
  '-D',
  'react/jsx-no-script-url',
  '-D',
  'react/no-danger-with-children',
  '-D',
  'react/no-children-prop',
  '-D',
  'react/jsx-no-duplicate-props',
  '-D',
  'react/void-dom-elements-no-children',
];

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

export function createOxlintArgs(targetFiles, { quiet = true, sizeRules = true } = {}) {
  const args = [
    ...(sizeRules ? STRICT_OXLINT_ARGS : BASE_OXLINT_ARGS),
    '--format',
    'unix',
    ...targetFiles,
  ];
  if (quiet) {
    args.push('--quiet');
  }
  return args;
}

export function runOxlint({
  files = [],
  quiet = true,
  sizeRules = true,
  commandRunner = runRepoNodeEntry,
} = {}) {
  const targetFiles = collectOxlintFiles(files);
  if (targetFiles.length === 0) {
    return {
      skipped: true,
      step: createSkippedStep('Oxlint'),
    };
  }

  return {
    skipped: false,
    step: createProcessStep(
      'Oxlint',
      commandRunner(OXLINT_ENTRY, createOxlintArgs(targetFiles, { quiet, sizeRules }), {
        stdio: 'pipe',
      })
    ),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const files = parseFilesArgument(process.argv.slice(2));
  const result = runOxlint({ files: files.length > 0 ? files : DEFAULT_OXLINT_ROOTS });
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
