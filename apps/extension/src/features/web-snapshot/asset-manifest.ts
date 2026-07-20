const WEB_SNAPSHOT_MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu;

export function isWebSnapshotAssetMimeType(value: unknown): value is string {
  return typeof value === 'string' && WEB_SNAPSHOT_MIME_TYPE_PATTERN.test(value);
}

export function normalizeWebSnapshotAssetMimeType(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? '';
  return isWebSnapshotAssetMimeType(normalized) ? normalized : 'application/octet-stream';
}

export function resolveAllowedWebSnapshotAssetMimeType(
  contentType: string | null,
  allowedMimeTypes: ReadonlySet<string>
): string {
  const mimeType = contentType?.split(';')[0]?.trim().toLowerCase();
  if (!mimeType || !allowedMimeTypes.has(mimeType)) {
    throw new Error('unsupported web snapshot asset MIME type');
  }

  return mimeType;
}

export async function hashWebSnapshotAssetBytes(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashWebSnapshotAssetBlob(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    return hashWebSnapshotAssetBytes(new Uint8Array(await blob.arrayBuffer()));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read web snapshot asset.'));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('Failed to read web snapshot asset.'));
        return;
      }
      hashWebSnapshotAssetBytes(new Uint8Array(reader.result)).then(resolve, reject);
    };
    reader.readAsArrayBuffer(blob);
  });
}
