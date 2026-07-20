import fs from 'node:fs';
import path from 'node:path';

import { collectLineViolations, createViolation } from './audit-guardrail-shared.mjs';

const STATE_MACHINE_OWNER_ROOTS = [
  'apps/extension/src/composition/persistence/ai-settings/',
  'apps/extension/src/composition/persistence/export-ledger/',
  'apps/extension/src/offscreen/recording/',
  'apps/extension/src/offscreen/project-export/',
];

const STATE_MACHINE_OWNER_FILE_PATTERN =
  /(?:state|status|ledger|session|transition|migration|lifecycle|runtime|runner|finalize|recorder)/u;
const STATE_MACHINE_SOURCE_PATTERNS = [
  /\b(?:migrationState|ledger|terminal|cancelled|failed)\b/u,
  /\bstatus\s*[:=]\s*['"](?:pending|running|cancelled|failed|complete)\b/u,
  /\b(?:type\s+\w*Status|interface\s+\w*Job)\b/u,
];
const STATE_MACHINE_PROOF_PATTERN =
  /\b(?:duplicate|replay|stale|terminal|failure|rollback|cancel)\b/iu;

function getStateMachineOwnerRoot(relativePath) {
  return STATE_MACHINE_OWNER_ROOTS.find((ownerRoot) => relativePath.startsWith(ownerRoot)) ?? null;
}

function collectOwnerTestFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectOwnerTestFiles(entryPath);
    }
    return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name) ? [entryPath] : [];
  });
}

function resolveSourceRoot(filePath, relativePath) {
  const absolutePath = path.resolve(filePath);
  const relativeSuffix = path.join(...relativePath.split('/'));
  return absolutePath.slice(0, -relativeSuffix.length);
}

function hasOwnerStateMachineProof(sourceRoot, ownerRoot, cache) {
  const cacheKey = `${sourceRoot}:${ownerRoot}`;
  if (!cache.has(cacheKey)) {
    const hasProof = collectOwnerTestFiles(path.join(sourceRoot, ownerRoot)).some((testPath) =>
      STATE_MACHINE_PROOF_PATTERN.test(fs.readFileSync(testPath, 'utf8'))
    );
    cache.set(cacheKey, hasProof);
  }
  return cache.get(cacheKey);
}

export function collectStateMachineProofViolations(files) {
  const ownerProofByRoot = new Map();
  return collectLineViolations(files, ({ filePath, relativePath, source }) => {
    const ownerRoot = getStateMachineOwnerRoot(relativePath);
    if (
      !ownerRoot ||
      !STATE_MACHINE_OWNER_FILE_PATTERN.test(relativePath) ||
      !STATE_MACHINE_SOURCE_PATTERNS.some((pattern) => pattern.test(source))
    ) {
      return [];
    }

    const sourceRoot = resolveSourceRoot(filePath, relativePath);
    if (hasOwnerStateMachineProof(sourceRoot, ownerRoot, ownerProofByRoot)) {
      return [];
    }

    return [
      createViolation(
        'state-machine-proof-missing',
        relativePath,
        1,
        'Security/export/recording state-machine owners need duplicate/replay/stale/terminal/failure proof.'
      ),
    ];
  });
}
