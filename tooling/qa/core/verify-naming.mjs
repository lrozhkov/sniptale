/**
 * Filename naming verifier.
 * The current hard-fail rollout stays narrow and enforces obvious mixed/Pascal-case
 * production .ts filenames while allowing existing useCamelCase hook-style modules.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  toRelativePath,
} from './shared.mjs';
import { isProductionSrcTypeScriptFile, normalizeRepoSrcPath } from './src-production-targets.mjs';
import {
  collectRepeatedChildPrefixViolations,
  collectWorkspaceNamingDelta,
  hasAmbiguousSameNameFacadeSource,
  isThinFacadeSource,
} from './verify-naming.facades.mjs';

const REPEATED_PREFIX_ENTRYPOINT_EXCEPTIONS = new Set([
  'apps/extension/src/offscreen/offscreen.ts',
]);

function isNamingTarget(relativePath) {
  return isProductionSrcTypeScriptFile(relativePath);
}

function isCamelCase(value) {
  return /^[a-z][a-zA-Z0-9]*$/u.test(value);
}

function isKebabCase(value) {
  if (value.length === 0 || value.startsWith('-') || value.endsWith('-')) {
    return false;
  }

  for (const character of value) {
    const isLowerAlpha = character >= 'a' && character <= 'z';
    const isDigit = character >= '0' && character <= '9';
    if (!isLowerAlpha && !isDigit && character !== '-') {
      return false;
    }
  }

  return !value.includes('--');
}

function getRepeatedPrefixMatch(normalizedPath, stem) {
  const pathSegments = normalizedPath.split('/').slice(0, -1);

  for (const segment of pathSegments) {
    if (!segment || segment === 'src') {
      continue;
    }

    if (stem === segment || stem.startsWith(`${segment}-`) || stem.startsWith(`${segment}.`)) {
      return segment;
    }
  }

  return null;
}

function classifyNamingViolation(relativePath) {
  const normalizedPath = normalizeRepoSrcPath(relativePath);
  const fileName = normalizedPath.split('/').pop();
  if (!fileName) {
    return null;
  }

  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex < 0) {
    return null;
  }

  const extension = fileName.slice(extensionIndex + 1);
  const stem = fileName.slice(0, extensionIndex).split('.')[0];

  if (stem.startsWith('use') && isCamelCase(stem)) {
    return null;
  }

  if (extension === 'tsx') {
    return null;
  }

  if (isKebabCase(stem) || !/[A-Z]/u.test(stem)) {
    return null;
  }

  return {
    file: normalizedPath,
    message: `ts filename stem "${stem}" uses mixed/Pascal case. Prefer kebab-case or useCamelCase for hooks.`,
    rule: 'filename-naming',
  };
}

function classifyRepeatedPrefixViolation(relativePath, absolutePath = null) {
  const normalizedPath = normalizeRepoSrcPath(relativePath);
  if (REPEATED_PREFIX_ENTRYPOINT_EXCEPTIONS.has(normalizedPath)) {
    return null;
  }

  const fileName = normalizedPath.split('/').pop();
  if (!fileName) {
    return null;
  }

  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex < 0) {
    return null;
  }

  const stem = fileName.slice(0, extensionIndex).split('.')[0];
  const repeatedPrefix = getRepeatedPrefixMatch(normalizedPath, stem);
  if (!repeatedPrefix) {
    return null;
  }

  const resolvedPath =
    absolutePath ??
    (path.isAbsolute(relativePath) ? relativePath : path.join(process.cwd(), normalizedPath));
  if (fs.existsSync(resolvedPath) && isThinFacadeSource(resolvedPath)) {
    return null;
  }

  return {
    file: normalizedPath,
    message:
      `filename stem "${stem}" repeats owner segment "${repeatedPrefix}". ` +
      'Prefer a shorter role-only name and keep long roots as thin facades only.',
    rule: 'repeated-prefix-naming',
  };
}

function classifyAmbiguousFacadeViolation(relativePath, absolutePath = null) {
  const normalizedPath = normalizeRepoSrcPath(relativePath);
  const resolvedPath =
    absolutePath ??
    (path.isAbsolute(relativePath) ? relativePath : path.join(process.cwd(), normalizedPath));

  if (!fs.existsSync(resolvedPath) || !hasAmbiguousSameNameFacadeSource(resolvedPath)) {
    return null;
  }

  return {
    file: normalizedPath,
    message:
      'thin facade uses an ambiguous same-name relative module specifier. ' +
      'Point facades at an explicit owner-local target like "./name/index".',
    rule: 'ambiguous-facade-naming',
  };
}

function collectNamingEntries(files) {
  return files
    .map((filePath) => ({
      absolutePath: path.isAbsolute(filePath) ? filePath : null,
      relativePath: normalizeRepoSrcPath(toRelativePath(filePath)),
    }))
    .filter(({ relativePath }) => isNamingTarget(relativePath));
}

export function collectNamingViolations(
  files,
  { baselineTopologyFiles = [], includeRepeatedPrefix = false } = {}
) {
  const entries = collectNamingEntries(files);

  const fileViolations = entries.flatMap(({ absolutePath, relativePath }) => {
    const violations = [classifyNamingViolation(relativePath)];

    if (files.length > 0 || includeRepeatedPrefix) {
      violations.push(classifyAmbiguousFacadeViolation(relativePath, absolutePath));
    }

    if (includeRepeatedPrefix) {
      violations.push(classifyRepeatedPrefixViolation(relativePath, absolutePath));
    }

    return violations.filter(Boolean);
  });

  if (!includeRepeatedPrefix) {
    return fileViolations;
  }

  return [
    ...fileViolations,
    ...collectRepeatedChildPrefixViolations(entries, collectNamingEntries(baselineTopologyFiles)),
  ];
}

export function runNamingCheck({ files = [], repoWide = false, scope = 'workspace' } = {}) {
  if (!repoWide && scope === 'workspace') {
    const delta = collectWorkspaceNamingDelta();
    const pathViolations = collectNamingViolations(delta.pathFiles, {
      includeRepeatedPrefix: true,
    }).filter((violation) => violation.rule !== 'repeated-child-prefix-topology');
    const topologyViolations = collectNamingViolations(delta.currentFiles, {
      baselineTopologyFiles: delta.previousFiles,
      includeRepeatedPrefix: true,
    }).filter((violation) => violation.rule === 'repeated-child-prefix-topology');
    return { files: delta.pathFiles, violations: [...pathViolations, ...topologyViolations] };
  }
  const namingFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: namingFiles.map(toRelativePath),
    violations: collectNamingViolations(namingFiles, {
      includeRepeatedPrefix: files.length > 0 || repoWide,
    }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const files = parseFilesArgument(argv);
  const reportOnly = argv.includes('--report-only');
  const repoWide = argv.includes('--repo-wide');
  const result = runNamingCheck({
    files,
    repoWide,
    scope: files.length > 0 && !repoWide ? 'explicit' : 'workspace',
  });

  if (result.violations.length > 0) {
    printViolations('Naming violations found:', result.violations);
    process.exit(reportOnly ? 0 : 1);
  }

  process.stdout.write('Naming check passed\n');
}
