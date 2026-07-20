import fs from 'node:fs';
import path from 'node:path';

import { QA_RULE_DEFINITIONS } from '../qa-steps/definitions.mjs';
import { collectRecursiveFiles } from '../recursive-files.mjs';
import { fromRelativePath, repoRoot } from '../shared.mjs';
import { hasExecutableEntryPoint } from './executables.mjs';

export const CONTROL_POLICY_PATH = 'tooling/configs/qa/control-dispositions.data.json';
export const CONTROL_INVENTORY_PATH = '.tmp/qa-controls/control-inventory.json';
export const VALIDATION_MANIFEST_PATH = 'tooling/configs/qa/validation-manifest.json';

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]s|tsx|json)$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]s|tsx)$/u;
const POLICY_FILE_PATTERN = /\.(?:json|ya?ml|toml)$/u;
const EXECUTABLE_FILE_PATTERN = /\.(?:[cm]?[jt]s)$/u;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(fromRelativePath(relativePath), 'utf8'));
}

function collectRepoFiles(root, predicate) {
  return collectRecursiveFiles(fromRelativePath(root), {
    baseDir: repoRoot,
    predicate,
  }).sort();
}

function collectTestSources() {
  return collectRepoFiles('tooling', (file) => TEST_FILE_PATTERN.test(file)).map((file) => ({
    file,
    source: fs.readFileSync(fromRelativePath(file), 'utf8'),
  }));
}

function collectValidationProof() {
  const entries = readJson(VALIDATION_MANIFEST_PATH).tools ?? [];
  const proof = new Map();
  const counts = new Map();
  for (const entry of entries) {
    proof.set(
      entry.tool,
      [...new Set([...(proof.get(entry.tool) ?? []), ...entry.testFiles])].sort()
    );
    counts.set(entry.tool, (counts.get(entry.tool) ?? 0) + 1);
  }
  return {
    duplicates: [...counts]
      .filter(([, count]) => count > 1)
      .map(([tool]) => tool)
      .sort(),
    proof,
  };
}

function collectReferencedTests(definition, testSources, manifestProof) {
  const manifestTests = manifestProof.get(definition.tool) ?? [];
  const tokens = [definition.tool, definition.source]
    .filter(Boolean)
    .flatMap((value) => [value, path.basename(value)]);
  const referenced = testSources
    .filter(({ source }) => tokens.some((token) => source.includes(token)))
    .map(({ file }) => file);
  return [...new Set([...manifestTests, ...referenced])].sort();
}

function collectPackageQaScripts() {
  const scripts = readJson('package.json').scripts ?? {};
  return Object.entries(scripts)
    .filter(([id]) => id.startsWith('qa:'))
    .map(([id, command]) => ({ id, command }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function collectExecutables(testSources, controls, packageQaScripts) {
  return collectRepoFiles('tooling', (file) => {
    if (!EXECUTABLE_FILE_PATTERN.test(file) || TEST_FILE_PATTERN.test(file)) return false;
    const source = fs.readFileSync(fromRelativePath(file), 'utf8');
    return hasExecutableEntryPoint(source, file);
  })
    .sort()
    .map((file) => {
      const basename = path.basename(file);
      const controlIds = controls
        .filter(({ source, tool }) => source === file || tool === basename)
        .map(({ id }) => id)
        .sort();
      const scriptIds = packageQaScripts
        .filter(({ command }) => command.includes(file) || command.includes(basename))
        .map(({ id }) => id)
        .sort();
      const proofFiles = testSources
        .filter(({ source }) => source.includes(file) || source.includes(basename))
        .map(({ file: testFile }) => testFile)
        .sort();
      return { path: file, controlIds, scriptIds, proofFiles };
    });
}

function collectPolicyFiles() {
  return collectRepoFiles('tooling/configs/qa', (file) => POLICY_FILE_PATTERN.test(file));
}

function collectPolicyConsumers(policyFiles) {
  const sources = [
    ...collectRepoFiles(
      'tooling',
      (file) => SOURCE_EXTENSIONS.test(file) && !TEST_FILE_PATTERN.test(file)
    ),
    'package.json',
  ].map((file) => ({ file, source: fs.readFileSync(fromRelativePath(file), 'utf8') }));

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
  const testSources = collectTestSources();
  const { duplicates: validationDuplicates, proof: manifestProof } = collectValidationProof();
  const controls = QA_RULE_DEFINITIONS.map((definition) => ({
    ...definition,
    sourceExists: definition.source.startsWith('tooling/')
      ? fs.existsSync(fromRelativePath(definition.source))
      : null,
    proofFiles: collectReferencedTests(definition, testSources, manifestProof),
  }));
  const policyFiles = collectPolicyFiles();
  const packageQaScripts = collectPackageQaScripts();
  return {
    schemaVersion: 1,
    controls,
    executables: collectExecutables(testSources, controls, packageQaScripts),
    packageQaScripts,
    policyFiles: collectPolicyConsumers(policyFiles),
    validationDuplicates,
    validationTools: [...manifestProof.keys()].sort(),
  };
}

export function readControlPolicy() {
  return readJson(CONTROL_POLICY_PATH);
}
