/**
 * Filename naming verifier.
 * The current hard-fail rollout stays narrow and enforces obvious mixed/Pascal-case
 * production .ts filenames while allowing existing useCamelCase hook-style modules.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { collectRenameSourceByTarget } from '../../../analysis/imports/import-only-diff/check.mjs';
import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { toRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../../runtime/process/shared-cli.mjs';
import {
  isProductionSrcTypeScriptFile,
  normalizeRepoSrcPath,
} from '../../../analysis/repository/src-production-targets.mjs';
import { hasAmbiguousSameNameFacadeSource, isThinFacadeSource } from './facades.mjs';
import { collectChangedTargets } from '../../../runtime/scope/changed-targets.helpers.mjs';

const REPEATED_CHILD_PREFIX_MIN_COUNT = 3;
const REPOSITORY_BASELINE_PATH = 'tooling/configs/qa/naming-repository-baseline.json';
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
  const ownerSegment = normalizedPath.split('/').at(-2);
  if (
    ownerSegment &&
    ownerSegment !== 'src' &&
    (stem === ownerSegment ||
      stem.startsWith(`${ownerSegment}-`) ||
      stem.startsWith(`${ownerSegment}.`))
  ) {
    return ownerSegment;
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

  if (/^use[A-Z]/u.test(stem) && isCamelCase(stem)) {
    return null;
  }

  if (extension === 'tsx') {
    return null;
  }

  if (isKebabCase(stem)) {
    return null;
  }

  return {
    file: normalizedPath,
    message: `ts filename stem "${stem}" is not kebab-case. Use useCamelCase only for hooks.`,
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

export function parseSuccessfulGitFileList(result) {
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function collectHeadFiles() {
  const result = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseSuccessfulGitFileList(result);
}

function collectWorkspaceNamingDelta() {
  const targets = collectChangedTargets({ scope: 'workspace' });
  const renamedTargets = collectRenameSourceByTarget().keys();
  const pathFiles = [
    ...new Set([...targets.addedFiles, ...targets.untrackedFiles, ...renamedTargets]),
  ].filter((file) => fs.existsSync(path.join(process.cwd(), file)));
  return {
    currentFiles: collectCodeFiles().map(toRelativePath),
    pathFiles,
    previousFiles: collectHeadFiles(),
  };
}

function findingKey({ file, rule }) {
  return `${rule}\u0000${file}`;
}

function loadRepositoryBaseline() {
  const value = JSON.parse(fs.readFileSync(REPOSITORY_BASELINE_PATH, 'utf8'));
  if (
    value?.schemaVersion !== 1 ||
    !Array.isArray(value.findings) ||
    value.findings.some(
      (finding) =>
        typeof finding?.file !== 'string' ||
        typeof finding?.rule !== 'string' ||
        Object.keys(finding).sort().join(',') !== 'file,rule'
    )
  ) {
    throw new Error('Repository naming baseline must contain exact file/rule findings.');
  }
  const keys = value.findings.map(findingKey);
  if (new Set(keys).size !== keys.length) {
    throw new Error('Repository naming baseline contains duplicate findings.');
  }
  return new Map(value.findings.map((finding) => [findingKey(finding), finding]));
}

function getLeadingToken(value) {
  return value.split('-')[0];
}

function getRepeatedChildTokenGroup(parentGroups, parent, leadingToken) {
  const parentGroup = parentGroups.get(parent) ?? new Map();
  const tokenGroup = parentGroup.get(leadingToken) ?? new Map([['__hasHyphenChild', false]]);
  parentGroup.set(leadingToken, tokenGroup);
  parentGroups.set(parent, parentGroup);
  return tokenGroup;
}

function buildRepeatedChildPrefixGroups(entries) {
  const parentGroups = new Map();
  for (const { relativePath } of entries) {
    const segments = relativePath.split('/');
    for (let index = 1; index < segments.length - 1; index += 1) {
      const parent = segments.slice(0, index).join('/');
      const child = segments[index];
      const leadingToken = getLeadingToken(child);
      if (!leadingToken) continue;
      const tokenGroup = getRepeatedChildTokenGroup(parentGroups, parent, leadingToken);
      if (!tokenGroup.has(child)) tokenGroup.set(child, relativePath);
      if (child.includes('-')) tokenGroup.set('__hasHyphenChild', true);
    }
  }
  return parentGroups;
}

function getChildEntries(tokenGroup) {
  return [...(tokenGroup?.entries() ?? [])].filter(([child]) => child !== '__hasHyphenChild');
}

function createRepeatedChildPrefixViolation(parent, leadingToken, childEntries) {
  const children = childEntries.map(([child]) => child).sort();
  const [, representativeFile] = childEntries.sort(([left], [right]) =>
    left.localeCompare(right)
  )[0];
  return {
    file: representativeFile,
    message:
      `owner "${parent}" has repeated child prefix "${leadingToken}" across ` +
      `${children.join(', ')}. Collapse to role-only child owners or introduce a clearer seam.`,
    rule: 'repeated-child-prefix-topology',
  };
}

function collectRepeatedChildPrefixViolations(entries, baselineEntries = []) {
  const violations = [];
  const baselineGroups = buildRepeatedChildPrefixGroups(baselineEntries);
  for (const [parent, parentGroup] of buildRepeatedChildPrefixGroups(entries)) {
    for (const [leadingToken, tokenGroup] of parentGroup) {
      const childEntries = getChildEntries(tokenGroup);
      const baselineChildren = new Set(
        getChildEntries(baselineGroups.get(parent)?.get(leadingToken)).map(([child]) => child)
      );
      const addedChildren = childEntries.filter(([child]) => !baselineChildren.has(child));
      if (
        tokenGroup.get('__hasHyphenChild') !== true ||
        childEntries.length < REPEATED_CHILD_PREFIX_MIN_COUNT ||
        addedChildren.length === 0
      ) {
        continue;
      }
      violations.push(createRepeatedChildPrefixViolation(parent, leadingToken, childEntries));
    }
  }
  return violations;
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

export function runChangedNamingCheck({ files = [] } = {}) {
  return runNamingCheck({ files, scope: 'workspace' });
}

export function runRepositoryNamingCheck() {
  const namingFiles = collectCodeFiles();
  const findings = collectNamingViolations(namingFiles, { includeRepeatedPrefix: true });
  const baseline = loadRepositoryBaseline();
  const currentKeys = new Set(findings.map(findingKey));
  const stale = [...baseline.entries()]
    .filter(([key]) => !currentKeys.has(key))
    .map(([, finding]) => ({
      ...finding,
      message: 'Repository naming baseline entry is stale and must be removed.',
      rule: 'stale-naming-baseline',
    }));
  return {
    files: namingFiles.map(toRelativePath),
    scope: 'repo-wide',
    violations: [...findings.filter((finding) => !baseline.has(findingKey(finding))), ...stale],
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const files = parseFilesArgument(argv);
  const reportOnly = argv.includes('--report-only');
  const repoWide = argv.includes('--repo-wide');
  const result = repoWide
    ? runRepositoryNamingCheck()
    : runNamingCheck({ files, scope: files.length > 0 ? 'explicit' : 'workspace' });

  if (result.violations.length > 0) {
    printViolations('Naming violations found:', result.violations);
    process.exit(reportOnly ? 0 : 1);
  }

  process.stdout.write('Naming check passed\n');
}
