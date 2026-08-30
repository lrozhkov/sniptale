import path from 'node:path';

export function resolveImportCandidates(targetFile) {
  const extensionless = targetFile.replace(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/u, '');
  return new Set([
    targetFile,
    extensionless,
    `${extensionless}.ts`,
    `${extensionless}.tsx`,
    `${extensionless}.js`,
    `${extensionless}.mjs`,
    `${extensionless}.cjs`,
    `${extensionless}/index.ts`,
    `${extensionless}/index.tsx`,
    `${extensionless}/index.js`,
    `${extensionless}/index.mjs`,
    `${extensionless}/index.cjs`,
  ]);
}

export function resolveRelativeImport(importer, specifier) {
  const importerDirectory = path.posix.dirname(importer);
  const joined = path.posix.normalize(path.posix.join(importerDirectory, specifier));
  return joined.replace(/^\.\/+/u, '');
}
