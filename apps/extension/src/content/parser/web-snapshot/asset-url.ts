export function resolveWebSnapshotAssetRequestUrl(value: string, baseUrl: string): string {
  const resolved = new URL(value, baseUrl);
  resolved.hash = '';
  return resolved.href;
}

export function createWebSnapshotLocalAssetReference(
  localPath: string,
  sourceValue: string,
  baseUrl: string
): string {
  const fragment = new URL(sourceValue, baseUrl).hash;
  return `../${localPath}${fragment}`;
}
