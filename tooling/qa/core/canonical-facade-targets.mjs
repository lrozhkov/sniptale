import fs from 'node:fs';
import path from 'node:path';

import { isProductSourcePath } from './src-production-targets.mjs';

const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function existingModuleTarget(candidates, root) {
  return candidates.find((candidate) => fs.existsSync(path.join(root, candidate))) ?? null;
}

function moduleCandidates(pathWithoutExtension) {
  return [
    ...MODULE_EXTENSIONS.map((extension) => `${pathWithoutExtension}${extension}`),
    ...MODULE_EXTENSIONS.map((extension) => `${pathWithoutExtension}/index${extension}`),
  ];
}

export function resolveLegacyFacadeTarget(importerPath, specifier, root) {
  const importerDirectory = path.posix.dirname(importerPath);
  const joined = path.posix.normalize(path.posix.join(importerDirectory, specifier));
  return existingModuleTarget(moduleCandidates(joined), root);
}

function resolveRepoPathTarget(specifier, root) {
  const normalized = specifier.replace(/^\//u, '');
  return existingModuleTarget(
    [normalized, ...moduleCandidates(normalized)].filter(isProductSourcePath),
    root
  );
}

export function resolveFacadeImportTarget(importerPath, specifier, root) {
  if (specifier.startsWith('.')) {
    return resolveLegacyFacadeTarget(importerPath, specifier, root);
  }

  return resolveRepoPathTarget(specifier, root);
}
