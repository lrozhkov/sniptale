import fs from 'node:fs';
import path, { posix } from 'node:path';

import { resolveMappedCoverageOwnerTests } from './focused-coverage-owner-map.mjs';
import { repoRoot } from './shared.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/u;

function replaceExtension(file, suffix) {
  return file.replace(/\.[cm]?[jt]sx?$/u, suffix);
}

function collectAdjacentTestCandidates(file) {
  if (!SOURCE_FILE_PATTERN.test(file)) return [];
  return [
    replaceExtension(file, '.test.ts'),
    replaceExtension(file, '.test.tsx'),
    replaceExtension(file, '.spec.ts'),
    replaceExtension(file, '.spec.tsx'),
  ];
}

function fromRoot(root, file) {
  return path.join(root, file);
}

function collectSameDirectoryTests(file, root) {
  const directory = posix.dirname(file);
  const absoluteDirectory = fromRoot(root, directory);
  if (!fs.existsSync(absoluteDirectory) || !fs.statSync(absoluteDirectory).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && TEST_FILE_PATTERN.test(entry.name))
    .map((entry) => `${directory}/${entry.name}`)
    .sort();
}

function collectDeterministicOwnerTests(file, options) {
  const root = options.root ?? repoRoot;
  const mapped = resolveMappedCoverageOwnerTests(file, options).filter((candidate) =>
    fs.existsSync(fromRoot(root, candidate))
  );
  const adjacent = collectAdjacentTestCandidates(file).filter((candidate) =>
    fs.existsSync(fromRoot(root, candidate))
  );
  return { adjacent, mapped, root };
}

export function resolveDeterministicFocusedCoverageOwnerTests(file, options = {}) {
  const { adjacent, mapped } = collectDeterministicOwnerTests(file, options);
  return [...new Set([...adjacent, ...mapped])].sort();
}

export function resolveLocalFocusedCoverageOwnerTests(file, options = {}) {
  const { adjacent, mapped, root } = collectDeterministicOwnerTests(file, options);
  const sameDirectory =
    mapped.length > 0 || adjacent.length > 0 ? [] : collectSameDirectoryTests(file, root);
  return [...new Set([...adjacent, ...mapped, ...sameDirectory])].sort();
}
