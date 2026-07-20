import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript, printViolations, repoRoot } from './shared.mjs';

const LAYOUT_POLICY_PATH = 'apps/extension/build/layout.data.json';

function digest(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

function collectFiles(root, directory = '') {
  const absoluteDirectory = path.join(root, directory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
    return entry.isDirectory() ? collectFiles(root, relativePath) : [relativePath];
  });
}

function readPolicy(rootDir) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, LAYOUT_POLICY_PATH), 'utf8'));
}

export function collectExtensionArtifactSnapshot({ rootDir = repoRoot } = {}) {
  const distRoot = path.join(rootDir, 'dist');
  return collectFiles(distRoot)
    .sort()
    .map((relativePath) => ({
      digest: digest(fs.readFileSync(path.join(distRoot, relativePath))),
      path: relativePath,
    }));
}

export function extensionArtifactSnapshotErrors(left, right) {
  const leftByPath = new Map(left.map((entry) => [entry.path, entry.digest]));
  const rightByPath = new Map(right.map((entry) => [entry.path, entry.digest]));
  return [
    ...[...leftByPath.keys()]
      .filter((file) => !rightByPath.has(file))
      .map((file) => `app build is missing root artifact: ${file}`),
    ...[...rightByPath.keys()]
      .filter((file) => !leftByPath.has(file))
      .map((file) => `app build has extra artifact: ${file}`),
    ...[...leftByPath]
      .filter(([file, artifactDigest]) => rightByPath.get(file) !== artifactDigest)
      .map(([file]) => `root/app artifact content differs: ${file}`),
  ].sort();
}

function createViolation(file, message) {
  return { rule: 'extension-build-artifacts', file, message };
}

export function collectExtensionBuildArtifactViolations({
  rootDir = repoRoot,
  policy = readPolicy(rootDir),
} = {}) {
  const distRoot = path.join(rootDir, policy.outputRoot);
  const artifactFiles = new Set(collectFiles(distRoot));
  const violations = policy.requiredReleaseArtifacts
    .filter((file) => !artifactFiles.has(file))
    .map((file) => createViolation(policy.outputRoot, `required artifact is missing: ${file}`));

  if (fs.existsSync(path.join(rootDir, policy.forbiddenOutputRoot))) {
    violations.push(
      createViolation(policy.forbiddenOutputRoot, 'app-local build output must not be created')
    );
  }

  const builtManifestPath = path.join(distRoot, 'manifest.json');
  const sourceManifestPath = path.join(rootDir, policy.manifestPath);
  if (fs.existsSync(builtManifestPath) && fs.existsSync(sourceManifestPath)) {
    const built = JSON.parse(fs.readFileSync(builtManifestPath, 'utf8'));
    const source = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
    if (built.action?.default_popup !== source.action?.default_popup) {
      violations.push(
        createViolation('dist/manifest.json', 'built popup path differs from the source contract')
      );
    }
    if (JSON.stringify(built.sandbox?.pages) !== JSON.stringify(source.sandbox?.pages)) {
      violations.push(
        createViolation('dist/manifest.json', 'built sandbox paths differ from the source contract')
      );
    }
  }
  return violations;
}

if (isExecutedAsScript(import.meta.url)) {
  const violations = collectExtensionBuildArtifactViolations();
  if (violations.length > 0) {
    printViolations('Extension build artifact violations found:', violations);
    process.exit(1);
  }
  process.stdout.write('Extension build artifacts passed\n');
}
