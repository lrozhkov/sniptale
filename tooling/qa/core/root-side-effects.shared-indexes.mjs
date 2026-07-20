import path from 'node:path';

const INDEX_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const SHARED_DOMAIN_OWNER_INDEX_PATHS = new Set([
  'apps/extension/src/features/editor/document/index.ts',
  'apps/extension/src/features/media-hub/index.ts',
  'apps/extension/src/features/prompt-templates/index.ts',
  'apps/extension/src/features/scenario/project/index.ts',
  'apps/extension/src/features/scenario/stage/index.ts',
  'apps/extension/src/features/video/composition/index.ts',
  'apps/extension/src/features/video/project/index.ts',
  'apps/extension/src/features/web-snapshot/index.ts',
]);
const SHARED_PERSISTENCE_OWNER_ROOTS = new Set([
  'db',
  'media-hub-backup',
  'scenario-store',
  'state-manager',
  'storage',
]);
function hasIndexFileName(relativePath) {
  const extension = path.posix.extname(relativePath);
  return (
    INDEX_EXTENSIONS.has(extension) && path.posix.basename(relativePath, extension) === 'index'
  );
}

export function isSharedOwnerRootIndex(relativePath) {
  if (!hasIndexFileName(relativePath)) {
    return false;
  }

  const segments = relativePath.split('/');
  if (segments[0] === 'packages' && segments[2] === 'src') {
    return true;
  }
  if (SHARED_DOMAIN_OWNER_INDEX_PATHS.has(relativePath)) {
    return true;
  }
  if (segments.slice(0, 4).join('/') !== 'apps/extension/src/composition') {
    return false;
  }
  if (segments[4] === 'persistence') {
    return segments.length === 7 && SHARED_PERSISTENCE_OWNER_ROOTS.has(segments[5]);
  }
  return false;
}
