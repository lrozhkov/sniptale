function getExtensionForBlob(blob: Blob): string {
  if (blob.type === 'image/svg+xml') {
    return 'svg';
  }
  if (blob.type === 'image/jpeg') {
    return 'jpg';
  }
  if (blob.type === 'image/webp') {
    return 'webp';
  }

  return 'png';
}

function sanitizeAssetId(assetId: string): string {
  return assetId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

export function createScenarioDeckAssetFilename(args: {
  assetId: string;
  blob: Blob;
  index: number;
}): string {
  const stem = sanitizeAssetId(args.assetId) || `asset-${args.index + 1}`;
  return `assets/${stem}.${getExtensionForBlob(args.blob)}`;
}
