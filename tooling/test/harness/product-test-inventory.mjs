import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { globSync } from 'tinyglobby';

const JSDOM_DIRECTIVE = '// @vitest-environment jsdom\n';
const PRODUCT_TEST_GLOBS = [
  'apps/extension/src/**/*.{test,spec}.{ts,tsx}',
  'packages/*/src/**/*.{test,spec}.{ts,tsx}',
];

export const JSDOM_VM_THREADS_COMPATIBILITY_FILES = [
  {
    file: 'apps/extension/src/content/parser/export-manager/diagnostics/source.test.ts',
    reason: 'redefines the ambient window global',
  },
  {
    file: 'apps/extension/src/content/parser/export-manager/service/assets.test.ts',
    reason: 'exceeds the unchanged wrapper timeout under vmThreads coverage instrumentation',
  },
  {
    file: 'apps/extension/src/content/parser/export-manager/service/source.integration.test.ts',
    reason: 'removes the ambient window global',
  },
  {
    file: 'apps/extension/src/content/parser/export-manager/service/source.test.ts',
    reason: 'redefines the ambient window global',
  },
  {
    file: 'apps/extension/src/content/parser/page-snapshot/source.test.ts',
    reason: 'redefines the ambient window global',
  },
  {
    file: 'apps/extension/src/content/parser/web-snapshot/asset-fetch.test.ts',
    reason: 'redefines the ambient document global',
  },
  {
    file: 'apps/extension/src/editor/inspector/compact/popover.test.tsx',
    reason: 'redefines the ambient document global',
  },
  {
    file: 'apps/extension/src/editor/inspector/presets/view-mode.test.ts',
    reason: 'redefines the ambient window global',
  },
  {
    file: 'apps/extension/src/features/video/composition/canvas/buffer-canvas.test.ts',
    reason: 'redefines the ambient document global',
  },
];

export const NODE_VM_THREADS_COMPATIBILITY_FILES = [
  {
    file: 'apps/extension/src/composition/persistence/ai-settings/provider-secrets.read-state.test.ts',
    reason: 'asserts host Error identity for a cross-realm WebCrypto DOMException',
  },
  {
    file: 'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.test.ts',
    reason: 'asserts host Error identity for a cross-realm WebCrypto DOMException',
  },
  {
    file: 'apps/extension/src/composition/persistence/web-snapshots/records.test.ts',
    reason: 'asserts a host DOMException message without its cross-realm name prefix',
  },
  {
    file: 'apps/extension/src/workflows/page-package/collection/archive.test.ts',
    reason: 'asserts the host AbortSignal reason across a VM realm boundary',
  },
];

function createDigest(files) {
  return crypto.createHash('sha256').update(files.join('\0')).update('\0').digest('hex');
}

function createIdentity(files) {
  return { count: files.length, digest: createDigest(files) };
}

function assertUniqueSortedFiles(files, label, { allowEmpty = false } = {}) {
  if (
    (!allowEmpty && files.length === 0) ||
    new Set(files).size !== files.length ||
    files.some((file, index) => index > 0 && files[index - 1] >= file)
  ) {
    throw new Error(`Product test ${label} must be a non-empty unique sorted path list.`);
  }
}

export function classifyProductTestFiles({
  files,
  readFile,
  jsdomCompatibilityFiles = JSDOM_VM_THREADS_COMPATIBILITY_FILES,
  nodeCompatibilityFiles = NODE_VM_THREADS_COMPATIBILITY_FILES,
}) {
  assertUniqueSortedFiles(files, 'inventory');
  const readCompatibilityPaths = (compatibilityFiles, label) =>
    compatibilityFiles.map(({ file, reason }) => {
      if (typeof file !== 'string' || file.length === 0 || typeof reason !== 'string' || !reason) {
        throw new Error(`Malformed ${label} vmThreads compatibility entry.`);
      }
      return file;
    });
  const jsdomCompatibilityPaths = readCompatibilityPaths(jsdomCompatibilityFiles, 'jsdom');
  const nodeCompatibilityPaths = readCompatibilityPaths(nodeCompatibilityFiles, 'node');
  const compatibilityPaths = [...jsdomCompatibilityPaths, ...nodeCompatibilityPaths].sort();
  assertUniqueSortedFiles(compatibilityPaths, 'compatibility registry', {
    allowEmpty: true,
  });

  const jsdomFiles = [];
  const nodeFiles = [];
  for (const file of files) {
    const source = readFile(file);
    if (source.startsWith(JSDOM_DIRECTIVE)) {
      jsdomFiles.push(file);
      continue;
    }
    if (source.includes('@vitest-environment jsdom')) {
      throw new Error(`Product jsdom directive must be the first line: ${file}`);
    }
    nodeFiles.push(file);
  }

  const allFiles = new Set(files);
  const jsdomFileSet = new Set(jsdomFiles);
  for (const file of jsdomCompatibilityPaths) {
    if (!allFiles.has(file))
      throw new Error(`jsdom vmThreads compatibility file is missing: ${file}`);
    if (!jsdomFileSet.has(file)) {
      throw new Error(`jsdom vmThreads compatibility file is not a jsdom test: ${file}`);
    }
  }
  const nodeFileSet = new Set(nodeFiles);
  for (const file of nodeCompatibilityPaths) {
    if (!allFiles.has(file))
      throw new Error(`node vmThreads compatibility file is missing: ${file}`);
    if (!nodeFileSet.has(file)) {
      throw new Error(`node vmThreads compatibility file is not a node test: ${file}`);
    }
  }

  const compatibilitySet = new Set(compatibilityPaths);
  const jsdomVmThreadsFiles = jsdomFiles.filter((file) => !compatibilitySet.has(file));
  const nodeVmThreadsFiles = nodeFiles.filter((file) => !compatibilitySet.has(file));
  const threadsFiles = compatibilityPaths;
  const projectedFiles = [...jsdomVmThreadsFiles, ...nodeVmThreadsFiles, ...threadsFiles];
  if (
    projectedFiles.length !== files.length ||
    new Set(projectedFiles).size !== files.length ||
    projectedFiles.some((file) => !allFiles.has(file))
  ) {
    throw new Error('Product test project partition is incomplete or overlapping.');
  }

  return {
    files,
    identities: {
      all: createIdentity(files),
      compatibility: createIdentity([...compatibilityPaths].sort()),
      jsdomCompatibility: createIdentity([...jsdomCompatibilityPaths].sort()),
      jsdom: createIdentity(jsdomFiles),
      node: createIdentity(nodeFiles),
      nodeCompatibility: createIdentity([...nodeCompatibilityPaths].sort()),
      nodeVmThreads: createIdentity(nodeVmThreadsFiles),
      threads: createIdentity(threadsFiles),
      jsdomVmThreads: createIdentity(jsdomVmThreadsFiles),
    },
    jsdomFiles,
    jsdomVmThreadsFiles,
    nodeFiles,
    nodeVmThreadsFiles,
    threadsFiles,
  };
}

export function collectProductTestInventory({ cwd = process.cwd() } = {}) {
  const files = globSync(PRODUCT_TEST_GLOBS, { cwd, onlyFiles: true }).sort();
  return classifyProductTestFiles({
    files,
    readFile: (file) => fs.readFileSync(path.join(cwd, file), 'utf8'),
  });
}
