import {
  MAX_PAGE_PACKAGE_ENTRIES,
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_PATHS,
  parsePagePackageManifest,
  resolvePagePackageScreenshotEntry,
} from '@sniptale/runtime-contracts/page-package';
import { openArchiveReader } from '../../composition/archive-transfer/reader';
import { hashWebSnapshotAssetBytes } from '../../features/web-snapshot/asset-manifest';
import { WEB_SNAPSHOT_PACKAGE_POLICY } from '../../features/web-snapshot/package-policy';

const MAX_PREVIEW_FILE_COUNT = MAX_PAGE_PACKAGE_ENTRIES + 1;
const MAX_PREVIEW_MANIFEST_BYTES = WEB_SNAPSHOT_PACKAGE_POLICY.maxManifestBytes;

export async function loadWebSnapshotScreenshotBlob(packageBlob: Blob): Promise<Blob> {
  if (
    packageBlob.type !== PAGE_PACKAGE_ARCHIVE_MIME_TYPE ||
    packageBlob.size <= 0 ||
    packageBlob.size > WEB_SNAPSHOT_PACKAGE_POLICY.maxArchiveBytes
  ) {
    throw new Error('Page Package is invalid or too large.');
  }
  const reader = await openArchiveReader(packageBlob);
  try {
    const archiveEntries = reader.entries();
    if (archiveEntries.length > MAX_PREVIEW_FILE_COUNT) {
      throw new Error('Page Package contains too many files.');
    }
    const manifestSource = reader.entry(PAGE_PACKAGE_ARCHIVE_PATHS.manifest);
    if (!manifestSource) throw new Error('Page Package manifest is missing.');
    const manifest = parsePagePackageManifest(
      JSON.parse(await manifestSource.text(MAX_PREVIEW_MANIFEST_BYTES)) as unknown
    );
    if (!manifest) throw new Error('Page Package manifest is invalid.');
    const declaredPaths = new Map(manifest.entries.map((entry) => [entry.path, entry]));
    if (archiveEntries.length !== declaredPaths.size + 1) {
      throw new Error('Page Package archive inventory does not match its manifest.');
    }
    for (const entry of archiveEntries) {
      if (entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.manifest) continue;
      const declared = declaredPaths.get(entry.path);
      if (!declared || declared.size !== entry.size) {
        throw new Error('Page Package archive inventory does not match its manifest.');
      }
      declaredPaths.delete(entry.path);
    }
    if (declaredPaths.size > 0) {
      throw new Error('Page Package archive inventory does not match its manifest.');
    }
    const screenshotSelection = resolvePagePackageScreenshotEntry(manifest.entries);
    const screenshotMetadata = screenshotSelection
      ? manifest.entries.find((entry) => entry.path === screenshotSelection.path)
      : undefined;
    const screenshotSource = screenshotSelection
      ? reader.entry(screenshotSelection.path)
      : undefined;
    if (
      !screenshotMetadata ||
      !screenshotSource ||
      screenshotSource.size <= 0 ||
      screenshotSource.size > WEB_SNAPSHOT_PACKAGE_POLICY.maxScreenshotBytes
    ) {
      throw new Error('Page Package screenshot is missing or too large.');
    }
    const bytes = new Uint8Array(screenshotSource.size);
    let offset = 0;
    await screenshotSource.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          if (offset + chunk.byteLength > bytes.byteLength) {
            throw new Error('Page Package screenshot size changed while reading.');
          }
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        },
      })
    );
    if (
      offset !== bytes.byteLength ||
      (await hashWebSnapshotAssetBytes(bytes)) !== screenshotMetadata.sha256
    ) {
      throw new Error('Page Package screenshot metadata does not match its content.');
    }
    return new Blob([bytes], { type: 'image/png' });
  } finally {
    await reader.close();
  }
}
