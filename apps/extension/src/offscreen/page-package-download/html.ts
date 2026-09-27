import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  parsePagePackageManifest,
} from '@sniptale/runtime-contracts/page-package';
import { openArchiveReader } from '../../composition/archive-transfer';
import { createWebSnapshotHtmlExport } from '../../features/web-snapshot/html-export';
import {
  WEB_SNAPSHOT_ARCHIVE_RESOURCE_PROFILE,
  WEB_SNAPSHOT_PACKAGE_POLICY,
  resolveWebSnapshotEntryByteLimit,
} from '../../features/web-snapshot/package-policy';
import { assertWebSnapshotMimeSignature } from '../../features/web-snapshot/mime-signature';
import {
  inspectArchiveEntrySource,
  readArchiveEntryBlob,
} from '../../workflows/page-package/import/entry-source';

/** Converts a bounded, revalidated export archive to a passive standalone Web copy. */
export async function createPagePackageHtmlDownload(file: File): Promise<Blob> {
  const reader = await openArchiveReader(file, {
    resourceProfile: WEB_SNAPSHOT_ARCHIVE_RESOURCE_PROFILE,
  });
  const objectUrls: string[] = [];
  try {
    const manifestSource = reader.entry(PAGE_PACKAGE_ARCHIVE_PATHS.manifest);
    if (!manifestSource) throw new Error('Missing HTML download manifest.');
    const value: unknown = JSON.parse(
      await manifestSource.text(WEB_SNAPSHOT_PACKAGE_POLICY.maxManifestBytes)
    );
    const manifest = parsePagePackageManifest(value);
    if (!manifest || manifest.intent !== 'export')
      throw new Error('Invalid HTML download manifest.');
    const entries = new Map(manifest.entries.map((entry) => [entry.path, entry]));
    if (reader.entries().length !== entries.size + 1)
      throw new Error('Invalid HTML download inventory.');
    for (const source of reader.entries()) {
      if (source.path === PAGE_PACKAGE_ARCHIVE_PATHS.manifest) continue;
      const entry = entries.get(source.path);
      if (
        !entry ||
        entry.size !== source.size ||
        entry.size > resolveWebSnapshotEntryByteLimit(entry.path, entry.mimeType)
      ) {
        throw new Error('Invalid HTML download entry.');
      }
      const inspected = await inspectArchiveEntrySource(reader.entry(source.path)!);
      if (inspected.sha256 !== entry.sha256) throw new Error('Invalid HTML download digest.');
      assertWebSnapshotMimeSignature(inspected.header, entry.mimeType, entry.path);
    }
    const htmlEntry = entries.get(PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml);
    if (!htmlEntry || htmlEntry.component !== 'webCopy')
      throw new Error('HTML download requires a Web copy.');
    const extractPackageFile = async (path: string): Promise<Blob> => {
      const entry = entries.get(path);
      const source = reader.entry(path);
      if (!entry || !source) throw new Error('Missing HTML download resource.');
      return readArchiveEntryBlob(
        source,
        entry.mimeType,
        resolveWebSnapshotEntryByteLimit(path, entry.mimeType)
      );
    };
    const assets = [];
    for (const entry of manifest.entries) {
      if (entry.component !== 'webCopy' || !entry.path.startsWith('assets/')) continue;
      const url = URL.createObjectURL(await extractPackageFile(entry.path));
      objectUrls.push(url);
      assets.push({ path: entry.path, mimeType: entry.mimeType, url });
    }
    const result = await createWebSnapshotHtmlExport({
      html: await reader.entry(htmlEntry.path)!.text(WEB_SNAPSHOT_PACKAGE_POLICY.maxTextEntryBytes),
      assetBasePath: htmlEntry.path,
      manifest,
      assets,
      extractPackageFile,
    });
    return result.blob;
  } finally {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    await reader.close();
  }
}
