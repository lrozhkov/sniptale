/** Packaged translation selections owned by each runtime surface. */
export const CATALOG_PROFILES = [
  'content',
  'content-shim',
  'popup',
  'popup-shell',
  'editor',
  'gallery',
  'video-editor',
  'scenario-editor',
  'settings',
  'web-snapshot-viewer',
  'camera-recorder',
  'background',
  'offscreen',
  'media-permission',
  'design-system',
] as const;

export type CatalogProfile = (typeof CATALOG_PROFILES)[number];
