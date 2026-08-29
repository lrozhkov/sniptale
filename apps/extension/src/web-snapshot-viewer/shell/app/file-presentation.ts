interface CatalogFilePresentationInput {
  mimeType: string;
  path: string;
  size: number;
}

export function formatCatalogFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function getCatalogFileName(path: string): string {
  return path.split('/').at(-1) || path;
}

export function getCatalogFileFormat(asset: CatalogFilePresentationInput): string {
  const subtype = asset.mimeType.split('/')[1]?.split(';')[0]?.trim().toLowerCase();
  const canonicalFormats: Record<string, string> = {
    jpeg: 'JPEG',
    'svg+xml': 'SVG',
    'x-font-ttf': 'TTF',
    'x-font-woff': 'WOFF',
  };
  if (subtype && subtype !== 'octet-stream') {
    return canonicalFormats[subtype] ?? subtype.toUpperCase();
  }
  const name = getCatalogFileName(asset.path);
  const extension = name.split('.').at(-1);
  return extension && extension !== name ? extension.toUpperCase() : 'BIN';
}
