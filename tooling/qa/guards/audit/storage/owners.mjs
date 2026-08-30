export const PERSISTENCE_AUTHORITY_OWNER_PATTERNS = [
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/indexed-db\/admission\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/infrastructure\/indexed-db\/core\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/editor-bootstrap\/retention\.ts$/u,
  /^apps\/extension\/src\/composition\/persistence\/video-preview-cache\/database\.ts$/u,
];

export function isPersistenceAuthorityOwner(normalizedPath) {
  return PERSISTENCE_AUTHORITY_OWNER_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}
