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
    const encodedPath = resolved.pathname.replace(/^\//u, '');
    if (assetPaths.has(encodedPath)) {
      return { fragment: resolved.hash, path: encodedPath };
    }

    const decodedPath = decodeURIComponent(encodedPath);
    return assetPaths.has(decodedPath) ? { fragment: resolved.hash, path: decodedPath } : null;
  } catch {
    return null;
  }
}

export function appendWebSnapshotAssetFragment(value: string, fragment: string): string {
  return `${value}${fragment}`;
}
