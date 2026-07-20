import { PRODUCT_SOURCE_ROOTS } from './quality.config.mjs';

export { PRODUCT_SOURCE_ROOTS } from './quality.config.mjs';

function sourceRootOffset(path) {
  return PRODUCT_SOURCE_ROOTS.toSorted((left, right) => right.length - left.length)
    .map((root) => path.indexOf(`${root}/`))
    .find((offset) => offset >= 0);
}

export function normalizeRepoSrcPath(relativePath) {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const offset = sourceRootOffset(normalizedPath);
  return offset == null ? normalizedPath : normalizedPath.slice(offset);
}

export function isProductSourcePath(relativePath) {
  const normalizedPath = normalizeRepoSrcPath(relativePath);
  return PRODUCT_SOURCE_ROOTS.some(
    (root) => normalizedPath === root || normalizedPath.startsWith(`${root}/`)
  );
}

export function isProductionSrcTypeScriptFile(relativePath) {
  const normalizedPath = normalizeRepoSrcPath(relativePath);
  return (
    isProductSourcePath(normalizedPath) &&
    /\.(ts|tsx)$/u.test(normalizedPath) &&
    !normalizedPath.includes('.test.') &&
    !normalizedPath.includes('.spec.') &&
    !normalizedPath.startsWith('tooling/test/harness/')
  );
}
