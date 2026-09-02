import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { QA_STEP_OCCURRENCES } from '../../catalog/definitions.mjs';
import { repoRoot as defaultRepoRoot } from '../../../analysis/repository/shared-paths.mjs';
import { analyzeExecutableEntrypoint } from '../executables/check.mjs';
import { collectExecutableOriginProjection } from './index.mjs';
import { createExecutableOriginSourceFile } from './source.mjs';

const TOOLING_SOURCE = /\.(?:[cm]?[jt]s|tsx|py|sh)$/u;
const TEST_SOURCE = /(?:\.test\.|\.spec\.|\.test-support\.)/u;
const EMBEDDED_ENTRY_SOURCE =
  /(?:isExecutedAsScript\(import\.meta\.url\)|runIfExecutedAsScript|require\.main\s*===\s*module|file:\/\/.*process\.argv)/u;
const DOCUMENTED_COMMAND_AUTHORITIES = Object.freeze([
  'docs/tooling/operator-handbook.md',
  'docs/tooling/wsl-setup.md',
]);
const WORKFLOW_AUTHORITIES = Object.freeze([
  '.github/workflows/_canonical-proof.yml',
  '.github/workflows/pr.yml',
  '.github/workflows/provenance-finalize.yml',
  '.github/workflows/provenance.yml',
  '.github/workflows/release.yml',
  '.github/workflows/selectel-maintenance.yml',
  '.github/workflows/selectel-smoke.yml',
]);
const HOOK_AUTHORITIES = Object.freeze(['.husky/pre-commit', '.husky/pre-push']);
export const REGISTRATION_AUTHORITY_PATHS = Object.freeze(
  [
    ...WORKFLOW_AUTHORITIES,
    ...HOOK_AUTHORITIES,
    ...DOCUMENTED_COMMAND_AUTHORITIES,
    'package.json',
    'tooling/ci/Dockerfile',
    'tooling/ci/selectel/Dockerfile.controller',
    'tooling/qa/composition/catalog/catalog.data.mjs',
    'tooling/test/mutation/package.json',
  ].sort()
);

function toRepositoryPath(root, absolutePath) {
  return path.relative(root, absolutePath).replaceAll(path.sep, '/');
}

function collectFiles(root, directory, predicate) {
  const absoluteDirectory = path.join(root, directory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  const files = [];
  const pending = [absoluteDirectory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') pending.push(absolutePath);
      else if (entry.isFile() && predicate(absolutePath)) {
        files.push(toRepositoryPath(root, absolutePath));
      }
    }
  }
  return files.sort();
}

function read(root, repositoryPath) {
  return fs.readFileSync(path.join(root, repositoryPath), 'utf8');
}

function collectTrackedExecutablePaths(root) {
  try {
    const output = execFileSync('git', ['ls-files', '--stage', '--', 'tooling'], {
      cwd: root,
      encoding: 'utf8',
    });
    return new Set(
      output
        .split(/\r?\n/u)
        .filter(Boolean)
        .flatMap((line) => {
          const match = /^(?<mode>\d+)\s+\S+\s+\d+\t(?<file>.+)$/u.exec(line);
          return match?.groups.mode === '100755' ? [match.groups.file] : [];
        })
    );
  } catch {
    return new Set();
  }
}

function collectPackageAuthorities(root) {
  const nested = ['apps', 'packages', 'tooling'].flatMap((directory) =>
    collectFiles(root, directory, (absolutePath) => path.basename(absolutePath) === 'package.json')
  );
  return ['package.json', ...nested].map((repositoryPath) => ({
    kind: 'package',
    path: repositoryPath,
    source: read(root, repositoryPath),
  }));
}

function collectSourceAuthorities(root) {
  const executablePaths = collectTrackedExecutablePaths(root);
  return collectFiles(root, 'tooling', (absolutePath) => TOOLING_SOURCE.test(absolutePath))
    .filter(
      (repositoryPath) => repositoryPath !== 'tooling/qa/composition/catalog/catalog.data.mjs'
    )
    .map((repositoryPath) => ({
      executableMode: executablePaths.has(repositoryPath),
      kind: TEST_SOURCE.test(repositoryPath) ? 'test-source' : 'source',
      path: repositoryPath,
      source: read(root, repositoryPath),
    }));
}

function collectCatalogAuthority() {
  return {
    controls: QA_STEP_OCCURRENCES.map(({ execution, id, lane, source }) => ({
      execution,
      id,
      lane,
      source,
    })),
    kind: 'catalog',
    path: 'tooling/qa/composition/catalog/catalog.data.mjs',
  };
}

function collectStaticAuthorities(root) {
  const docker = collectFiles(root, 'tooling', (absolutePath) =>
    path.basename(absolutePath).startsWith('Dockerfile')
  ).map((repositoryPath) => ({
    kind: 'docker',
    path: repositoryPath,
    source: read(root, repositoryPath),
  }));
  const records = [
    ...WORKFLOW_AUTHORITIES.map((repositoryPath) => ({
      kind: 'workflow',
      path: repositoryPath,
      source: read(root, repositoryPath),
    })),
    ...HOOK_AUTHORITIES.map((repositoryPath) => ({
      kind: 'hook',
      path: repositoryPath,
      source: read(root, repositoryPath),
    })),
    ...DOCUMENTED_COMMAND_AUTHORITIES.map((repositoryPath) => ({
      kind: 'docs',
      path: repositoryPath,
      source: read(root, repositoryPath),
    })),
    ...docker,
  ];
  return records.filter(({ path: repositoryPath }) =>
    fs.existsSync(path.join(root, repositoryPath))
  );
}

function classifyNonTargetPopulations(authorities) {
  const embeddedSourceFixtures = [];
  const eagerCandidates = [];
  for (const authority of authorities) {
    if (
      !['source', 'test-source'].includes(authority.kind) ||
      !/\.(?:[cm]?[jt]s|tsx)$/u.test(authority.path)
    ) {
      continue;
    }
    const sourceFile = createExecutableOriginSourceFile(authority.path, authority.source);
    const analysis = analyzeExecutableEntrypoint(authority.source, authority.path, { sourceFile });
    if (authority.kind === 'source' && analysis.classification === 'eager') {
      eagerCandidates.push(authority.path);
    }
    if (authority.kind === 'test-source') {
      if (EMBEDDED_ENTRY_SOURCE.test(authority.source)) {
        embeddedSourceFixtures.push(authority.path);
      }
    }
  }
  return {
    eagerCandidates: eagerCandidates.sort(),
    embeddedSourceFixtures: embeddedSourceFixtures.sort(),
  };
}

export function collectRepositoryExecutableOrigins({ repoRoot = defaultRepoRoot } = {}) {
  const sourceAuthorities = collectSourceAuthorities(repoRoot);
  const packageAuthorities = collectPackageAuthorities(repoRoot);
  const authorities = [
    ...sourceAuthorities,
    ...packageAuthorities,
    ...collectStaticAuthorities(repoRoot),
    collectCatalogAuthority(),
  ];
  const populations = classifyNonTargetPopulations(sourceAuthorities);
  const authorityInputs = [
    'tooling/ci/Dockerfile',
    'tooling/ci/selectel/Dockerfile.controller',
    'tooling/configs/ci/toolchain.lock.json',
    'tooling/test/mutation/package.json',
    'tooling/test/mutation/package-lock.json',
  ].filter((repositoryPath) => fs.existsSync(path.join(repoRoot, repositoryPath)));
  return collectExecutableOriginProjection({
    authorities,
    embeddedSourceFixtures: populations.embeddedSourceFixtures,
    eagerCandidates: populations.eagerCandidates,
    exists: (target) => fs.existsSync(path.join(repoRoot, target)),
    inputs: authorityInputs,
    registrationAuthorityPaths: [
      ...new Set([
        ...REGISTRATION_AUTHORITY_PATHS,
        ...packageAuthorities.map(({ path: authorityPath }) => authorityPath),
      ]),
    ],
  });
}
