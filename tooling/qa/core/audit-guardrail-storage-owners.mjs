export const BACKUP_IMPORT_OWNER_PATTERN =
  /^apps\/extension\/src\/workflows\/media-hub-backup\/(?:import|restore).*\.ts$/u;

const ZIP_OWNER_PREFIXES = [
  'apps/extension/src/content/parser/web-snapshot/',
  'apps/extension/src/web-snapshot-viewer',
  'apps/extension/src/workflows/media-hub-backup/',
  'apps/extension/src/features/video/project/effect-bundle/',
  'apps/extension/src/background/media-hub/',
];

export const PERSISTENCE_AUTHORITY_OWNER_PATTERNS = [
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/indexed-db\/core\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/editor-bootstrap\/retention\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/video-preview-cache\/database\.ts$/u,
];

export function isZipOwner(relativePath) {
  return ZIP_OWNER_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

export function isBoundaryParserOwner(relativePath) {
  return (
    relativePath.startsWith('apps/extension/src/workflows/media-hub-backup/') ||
    relativePath.startsWith('apps/extension/src/features/video/project/effect-bundle/') ||
    relativePath.startsWith('apps/extension/src/contracts/') ||
    relativePath.startsWith('packages/runtime-contracts/src/') ||
    relativePath.startsWith('apps/extension/src/background/') ||
    relativePath.startsWith('apps/extension/src/offscreen/')
  );
}

export function isPersistenceAuthorityOwner(normalizedPath) {
  return PERSISTENCE_AUTHORITY_OWNER_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}
