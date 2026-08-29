interface WebSnapshotLocalAssetReference {
  fragment: string;
  path: string;
}

export function resolveWebSnapshotLocalAssetReference(
  value: string,
  sourcePath: string,
  assetPaths: ReadonlySet<string>
): WebSnapshotLocalAssetReference | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  try {
    const base = new URL(sourcePath, 'https://sniptale.invalid/');
    const resolved = new URL(trimmed, base);
    if (resolved.origin !== base.origin || resolved.search) return null;
    const path = decodeURIComponent(resolved.pathname.replace(/^\//u, ''));
    return assetPaths.has(path) ? { fragment: resolved.hash, path } : null;
  } catch {
    return null;
  }
}

export function appendWebSnapshotAssetFragment(value: string, fragment: string): string {
  return `${value}${fragment}`;
}
