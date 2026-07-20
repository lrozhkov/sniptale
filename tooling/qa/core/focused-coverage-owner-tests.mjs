import fs from 'node:fs';
import { posix } from 'node:path';

import { resolveMappedCoverageOwnerTests } from './focused-coverage-owner-map.mjs';
import { fromRelativePath } from './shared.mjs';

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

function collectSameDirectoryTests(file) {
  const directory = posix.dirname(file);
  const absoluteDirectory = fromRelativePath(directory);
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
  const mapped = resolveMappedCoverageOwnerTests(file, options).filter((candidate) =>
    fs.existsSync(fromRelativePath(candidate))
  );
  const adjacent = collectAdjacentTestCandidates(file).filter((candidate) =>
    fs.existsSync(fromRelativePath(candidate))
  );
  return { adjacent, mapped };
}

export function resolveDeterministicFocusedCoverageOwnerTests(file, options = {}) {
  const { adjacent, mapped } = collectDeterministicOwnerTests(file, options);
  return [...new Set([...adjacent, ...mapped])].sort();
}

export function resolveLocalFocusedCoverageOwnerTests(file, options = {}) {
  const { adjacent, mapped } = collectDeterministicOwnerTests(file, options);
  const sameDirectory = mapped.length > 0 ? [] : collectSameDirectoryTests(file);
  return [...new Set([...adjacent, ...mapped, ...sameDirectory])].sort();
}
