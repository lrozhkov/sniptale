import fs from 'node:fs';
import path from 'node:path';

import { QA_RULE_DEFINITIONS } from '../catalog/definitions.mjs';
import { collectRecursiveFiles } from '../../analysis/repository/recursive-files.mjs';
import { fromRelativePath, repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { collectRepositoryExecutableOrigins } from './executable-origins/repository.mjs';
import { createExecutableOriginSourceFile } from './executable-origins/source.mjs';
import { analyzeExecutableEntrypoint } from './executables/check.mjs';

export const CONTROL_POLICY_PATH = 'tooling/configs/qa/control-dispositions.data.json';
export const CONTROL_INVENTORY_PATH = '.tmp/qa-controls/control-inventory.json';

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]s|tsx|json)$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]s|tsx)$/u;
const POLICY_FILE_PATTERN = /\.(?:json|ya?ml|toml)$/u;
const GENERATED_INVENTORY_SOURCE_FILES = new Set([
  CONTROL_POLICY_PATH,
  'tooling/configs/qa/technical-debt.data.json',
]);

export function isPolicyConsumerEvidenceFile(file) {
  return (
    SOURCE_EXTENSIONS.test(file) &&
    !TEST_FILE_PATTERN.test(file) &&
    !GENERATED_INVENTORY_SOURCE_FILES.has(file)
  );
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(fromRelativePath(relativePath), 'utf8'));
}

function collectRepoFiles(root, predicate) {
  return collectRecursiveFiles(fromRelativePath(root), {
    baseDir: repoRoot,
    predicate,
  }).sort();
}

function collectPackageQaScripts() {
  const scripts = readJson('package.json').scripts ?? {};
  return Object.entries(scripts)
    .filter(([id]) => id.startsWith('qa:'))
    .map(([id, command]) => ({ id, command }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function entrypointMetadata(file, origins, readSource) {
  if (/\.(?:[cm]?[jt]s|tsx)$/u.test(file)) {
    const source = readSource(file);
    const sourceFile = createExecutableOriginSourceFile(file, source);
    const analysis = analyzeExecutableEntrypoint(source, file, { sourceFile });
    const declaredKind = origins.find(
      ({ authority, kind }) => authority === file && kind !== 'qa-catalog-execution'
    )?.kind;
    return {
      entrypointKind:
        analysis.classification === 'silent' && declaredKind
          ? declaredKind
          : analysis.classification,
      importSafety: analysis.importSafe ? 'safe' : 'unsafe',
    };
  }
  const declaredKind = origins.find(({ authority }) => authority === file)?.kind;
  return {
    entrypointKind: declaredKind ?? 'process-target',
    importSafety: 'not-applicable',
  };
}

export function buildExecutableDiscovery({ controls, originProjection, readSource }) {
  const originsByTarget = new Map();
  for (const origin of originProjection.origins) {
    const current = originsByTarget.get(origin.target) ?? [];
    current.push(origin);
    originsByTarget.set(origin.target, current);
  }
  return originProjection.targets.map((file) => {
    const origins = (originsByTarget.get(file) ?? []).sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    const exactControls = controls.filter(({ source }) => source === file);
    const proofFiles = [
      ...new Set([
        ...origins
          .filter(({ kind }) => kind === 'test-process-target')
          .map(({ authority }) => authority),
      ]),
    ].sort();
    return {
      path: file,
      controlIds: exactControls.map(({ id }) => id).sort(),
      scriptIds: [
        ...new Set(
          origins
            .filter(({ kind, scriptId }) => kind === 'package-script' && scriptId)
            .map(({ scriptId }) => scriptId)
        ),
      ].sort(),
      proofFiles,
      origins: origins.map(({ id }) => id),
      ...entrypointMetadata(file, origins, readSource),
    };
  });
}

function collectPolicyFiles() {
  return collectRepoFiles('tooling/configs/qa', (file) => POLICY_FILE_PATTERN.test(file));
}

function collectPolicyConsumers(policyFiles) {
  const sources = [
    ...collectRepoFiles('tooling', isPolicyConsumerEvidenceFile),
    'package.json',
  ].map((file) => ({
    file,
    source: fs.readFileSync(fromRelativePath(file), 'utf8'),
  }));

  return policyFiles.map((policyPath) => {
    const basename = path.basename(policyPath);
    const consumers = sources
      .filter(({ file, source }) => file !== policyPath && source.includes(basename))
      .map(({ file }) => file)
      .sort();
    return { path: policyPath, consumers };
  });
}

export function collectControlDiscovery() {
  const originProjection = collectRepositoryExecutableOrigins();
  const controls = QA_RULE_DEFINITIONS.map((definition) => ({
    ...definition,
    sourceExists: definition.source.startsWith('tooling/')
      ? fs.existsSync(fromRelativePath(definition.source))
      : null,
  }));
  const policyFiles = collectPolicyFiles();
  const packageQaScripts = collectPackageQaScripts();
  return {
    schemaVersion: 4,
    controls,
    executables: buildExecutableDiscovery({
      controls,
      originProjection,
      readSource: (file) => fs.readFileSync(fromRelativePath(file), 'utf8'),
    }),
    packageQaScripts,
    policyFiles: collectPolicyConsumers(policyFiles),
  };
}

export function readControlPolicy() {
  return readJson(CONTROL_POLICY_PATH);
}
