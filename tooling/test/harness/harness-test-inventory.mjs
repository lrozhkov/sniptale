import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { globSync } from 'tinyglobby';

const JSDOM_DIRECTIVE = '// @vitest-environment jsdom\n';
const HARNESS_TEST_GLOB = 'tooling/**/*.{test,spec}.{ts,tsx}';
const FORK_COMPATIBILITY_PATTERN = /(?:process\.chdir\s*\(|\bwithCwd\b)/u;
const FORK_COMPATIBILITY_FILES = new Set([
  'tooling/ci/ci-contract.test.ts',
  'tooling/qa/wrappers/advisory.test.ts',
  'tooling/qa/guards/product-contracts/react/verify-react-transform.test.ts',
  'tooling/test/harness/vite-injected-build.test.ts',
]);

function createIdentity(files) {
  return {
    count: files.length,
    digest: crypto.createHash('sha256').update(files.join('\0')).update('\0').digest('hex'),
  };
}

function assignBalanced(files, weights) {
  const partitions = [[], []];
  const totals = [0, 0];
  for (const file of [...files].sort((left, right) => {
    const weightDifference = weights.get(right) - weights.get(left);
    return weightDifference === 0 ? left.localeCompare(right) : weightDifference;
  })) {
    const index = totals[0] <= totals[1] ? 0 : 1;
    partitions[index].push(file);
    totals[index] += weights.get(file);
  }
  return partitions.map((partition) => partition.sort());
}

export function classifyHarnessTestFiles({ files, readFile }) {
  const uniqueFiles = [...new Set(files)].sort();
  if (
    uniqueFiles.length !== files.length ||
    uniqueFiles.some((file, index) => file !== files[index])
  ) {
    throw new Error('Harness test inventory must be a non-empty unique sorted path list.');
  }
  if (files.length === 0) throw new Error('Harness test inventory must not be empty.');

  const jsdomVmThreadsFiles = [];
  const forkFiles = [];
  const nodeVmCandidates = [];
  const weights = new Map();
  for (const file of files) {
    const source = readFile(file);
    weights.set(file, Buffer.byteLength(source));
    if (source.startsWith(JSDOM_DIRECTIVE)) {
      jsdomVmThreadsFiles.push(file);
    } else if (FORK_COMPATIBILITY_FILES.has(file) || FORK_COMPATIBILITY_PATTERN.test(source)) {
      forkFiles.push(file);
    } else {
      nodeVmCandidates.push(file);
    }
  }
  const [nodeVmThreadsFilesA, nodeVmThreadsFilesB] = assignBalanced(nodeVmCandidates, weights);
  const projected = [
    ...forkFiles,
    ...jsdomVmThreadsFiles,
    ...nodeVmThreadsFilesA,
    ...nodeVmThreadsFilesB,
  ];
  if (new Set(projected).size !== files.length) {
    throw new Error('Harness test partition is incomplete or overlapping.');
  }

  return {
    files,
    forkFiles,
    jsdomVmThreadsFiles,
    nodeVmThreadsFilesA,
    nodeVmThreadsFilesB,
    identities: {
      all: createIdentity(files),
      forks: createIdentity(forkFiles),
      jsdomVmThreads: createIdentity(jsdomVmThreadsFiles),
      nodeVmThreadsA: createIdentity(nodeVmThreadsFilesA),
      nodeVmThreadsB: createIdentity(nodeVmThreadsFilesB),
    },
  };
}

export function collectHarnessTestInventory({ cwd = process.cwd() } = {}) {
  const files = globSync(HARNESS_TEST_GLOB, { cwd, onlyFiles: true }).sort();
  return classifyHarnessTestFiles({
    files,
    readFile: (file) => fs.readFileSync(path.join(cwd, file), 'utf8'),
  });
}
