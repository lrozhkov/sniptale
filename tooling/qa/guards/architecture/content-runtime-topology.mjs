import fs from 'node:fs';
import path from 'node:path';

const CONTENT_RUNTIME_FILE = 'assets/contentRuntime.js';
const CONTENT_RUNTIME_REFERENCE_ALLOWLIST = new Set([
  'apps/extension/build/layout.data.json',
  'apps/extension/build/injected-build.ts',
  'apps/extension/src/background/runtime/page-access/registration.ts',
  'tooling/qa/guards/architecture/content-runtime-topology.mjs',
]);
const SKIPPED_SCAN_DIRS = new Set(['.git', '.tmp', 'coverage', 'dist', 'node_modules', 'public']);
const TEXT_FILE_PATTERN = /\.(?:cjs|cts|js|json|jsx|mjs|mts|ts|tsx)$/u;

function toAbsolutePath(rootDir, relativePath) {
  return path.join(rootDir, relativePath);
}

function createViolation(file) {
  return {
    file,
    message: [
      `${CONTENT_RUNTIME_FILE} is owned by dynamic content runtime build`,
      'and page-access registration; manifest content_scripts remain forbidden',
      'while grant-mode persistent registration is allowed.',
    ].join(' '),
    rule: 'runtime-topology-content-runtime-reference',
  };
}

function isAllowedContentRuntimeReference(relativePath) {
  return (
    CONTENT_RUNTIME_REFERENCE_ALLOWLIST.has(relativePath) ||
    /\.test\.[cm]?[jt]sx?$/u.test(relativePath) ||
    relativePath.includes('.test.') ||
    relativePath.includes('/test-fixtures/') ||
    relativePath.includes('/fixtures/')
  );
}

function collectTextFiles(rootDir, relativeDir = '') {
  const absoluteDir = toAbsolutePath(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIPPED_SCAN_DIRS.has(entry.name)) {
        files.push(...collectTextFiles(rootDir, relativePath));
      }
      continue;
    }

    if (entry.isFile() && TEXT_FILE_PATTERN.test(entry.name)) {
      files.push(relativePath);
    }
  }
  return files;
}

export function collectContentRuntimeReferenceViolations(rootDir) {
  return collectTextFiles(rootDir)
    .filter((relativePath) => !isAllowedContentRuntimeReference(relativePath))
    .filter((relativePath) =>
      fs.readFileSync(toAbsolutePath(rootDir, relativePath), 'utf8').includes(CONTENT_RUNTIME_FILE)
    )
    .map(createViolation);
}
