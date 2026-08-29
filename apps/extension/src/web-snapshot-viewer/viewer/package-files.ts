import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { hashWebSnapshotAssetBytes } from '../../features/web-snapshot/asset-manifest';

export interface ViewerPackageFile {
  kind: 'attachment' | 'exported-image';
  mimeType: string;
  name: string;
  path: string;
  size: number;
}

function getPackageFileName(path: string): string {
  return path.split('/').at(-1) || 'file.bin';
}

function getViewerPackageFileKind(
  entry: WebSnapshotManifest['entries'][number]
): ViewerPackageFile['kind'] | null {
  if (entry.component === 'attachments' && entry.path.startsWith('attachments/')) {
    return 'attachment';
  }
  if (entry.component === 'images' && entry.path.startsWith('exports/images/')) {
    return 'exported-image';
  }
  return null;
}

export function createViewerPackageFileCatalog(manifest: WebSnapshotManifest): ViewerPackageFile[] {
  return manifest.entries.flatMap((entry) => {
    const kind = getViewerPackageFileKind(entry);
    if (kind === null) return [];
    return [
      {
        kind,
        mimeType: entry.mimeType,
        name: getPackageFileName(entry.path),
        path: entry.path,
        size: entry.size,
      },
    ];
  });
}

export function createViewerPackageFileExtractor(args: {
  manifest: WebSnapshotManifest;
  readEntry: (path: string) => Promise<Uint8Array>;
}): (path: string) => Promise<Blob> {
  const entriesByPath = new Map(
    args.manifest.entries
      .filter((entry) => getViewerPackageFileKind(entry) !== null)
      .map((entry) => [entry.path, entry])
  );

  return async (path: string) => {
    const entry = entriesByPath.get(path);
    if (!entry) throw new Error('Snapshot package file is not available for download.');
    const bytes = await args.readEntry(entry.path);
    if (
      bytes.byteLength !== entry.size ||
      (await hashWebSnapshotAssetBytes(bytes)) !== entry.sha256
    ) {
      throw new Error(`Page Package entry metadata does not match: ${entry.path}.`);
    }
    const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
    copy.set(bytes);
    return new Blob([copy], { type: entry.mimeType });
  };
}
