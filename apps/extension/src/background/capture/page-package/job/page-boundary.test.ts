import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { hashWebSnapshotAssetBytes } from '../../../../features/web-snapshot/asset-manifest';
import { createPagePackageArchiveFixture } from '../../../../features/web-snapshot/package.test-support';
import { openStagedPagePackage, type StagedPagePackageDescriptor } from './page-boundary';

const activeSignal = new AbortController().signal;

async function fixture() {
  const value = await createPagePackageArchiveFixture({
    manifest: { intent: 'export' },
  });
  const manifestText = `${JSON.stringify(value.manifest, null, 2)}\n`;
  const manifestBytes = new TextEncoder().encode(manifestText);
  const descriptor: StagedPagePackageDescriptor = {
    jobId: 'job-1',
    manifestSha256: await hashWebSnapshotAssetBytes(manifestBytes),
    manifestSize: manifestBytes.byteLength,
    ordinal: 0,
    pageId: value.manifest.id,
    producerStats: { filesCount: 1, filesFailed: 0, rowsCount: 2, sectionsCount: 1 },
    stagedBlobId: 'stage-1',
    title: value.manifest.source.title,
    totalBytes: value.manifest.stats.totalBytes + manifestBytes.byteLength,
  };
  const bytes = await value.packageBlob.arrayBuffer();
  return {
    descriptor,
    file: new File([bytes], 'page-package.zip', { type: value.packageBlob.type }),
  };
}

describe('staged Page Package boundary', () => {
  it('parses exact inventory and verifies every entry digest', async () => {
    const value = await fixture();
    const opened = await openStagedPagePackage(value.file, value.descriptor, activeSignal);

    expect(opened.pagePackage.manifest.id).toBe(value.descriptor.pageId);
    expect(opened.pagePackage.entries.length).toBeGreaterThan(0);
    await opened.reader.close();
  });

  it('rejects a descriptor that does not match the archived manifest', async () => {
    const value = await fixture();
    await expect(
      openStagedPagePackage(
        value.file,
        { ...value.descriptor, manifestSha256: 'a'.repeat(64) },
        activeSignal
      )
    ).rejects.toThrow('descriptor does not match');
  });

  it('binds capture-session authority only to Save-intent packages', async () => {
    const exported = await fixture();
    await expect(
      openStagedPagePackage(
        exported.file,
        {
          ...exported.descriptor,
          snapshotSessionId: 'session-1',
        },
        activeSignal
      )
    ).rejects.toThrow('intent authority');

    const saved = await createPagePackageArchiveFixture({ manifest: { intent: 'save' } });
    const manifestText = `${JSON.stringify(saved.manifest, null, 2)}\n`;
    const manifestBytes = new TextEncoder().encode(manifestText);
    const descriptor: StagedPagePackageDescriptor = {
      jobId: 'job-1',
      manifestSha256: await hashWebSnapshotAssetBytes(manifestBytes),
      manifestSize: manifestBytes.byteLength,
      ordinal: 0,
      pageId: saved.manifest.id,
      producerStats: { filesCount: 1, filesFailed: 0, rowsCount: 0, sectionsCount: 1 },
      stagedBlobId: 'stage-1',
      title: saved.manifest.source.title,
      totalBytes: saved.manifest.stats.totalBytes + manifestBytes.byteLength,
    };
    const bytes = await saved.packageBlob.arrayBuffer();
    await expect(
      openStagedPagePackage(
        new File([bytes], 'saved-page-package.zip', { type: saved.packageBlob.type }),
        descriptor,
        activeSignal
      )
    ).rejects.toThrow('intent authority');
  });

  it('rejects an entry whose bytes do not match the manifest digest', async () => {
    const value = await createPagePackageArchiveFixture({ manifest: { intent: 'export' } });
    const manifest = {
      ...value.manifest,
      entries: value.manifest.entries.map((entry, index) =>
        index === 0 ? { ...entry, sha256: '0'.repeat(64) } : entry
      ),
    };
    const zip = await JSZip.loadAsync(await value.packageBlob.arrayBuffer());
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    zip.file('manifest.json', manifestText, { createFolders: false });
    const archiveBytes = await zip.generateAsync({ type: 'uint8array' });
    const manifestBytes = new TextEncoder().encode(manifestText);
    const descriptor: StagedPagePackageDescriptor = {
      jobId: 'job-1',
      manifestSha256: await hashWebSnapshotAssetBytes(manifestBytes),
      manifestSize: manifestBytes.byteLength,
      ordinal: 0,
      pageId: manifest.id,
      producerStats: { filesCount: 1, filesFailed: 0, rowsCount: 2, sectionsCount: 1 },
      stagedBlobId: 'stage-1',
      title: manifest.source.title,
      totalBytes: manifest.stats.totalBytes + manifestBytes.byteLength,
    };
    const archiveCopy = new Uint8Array(new ArrayBuffer(archiveBytes.byteLength));
    archiveCopy.set(archiveBytes);
    const file = new File([archiveCopy], 'page-package.zip', {
      type: value.packageBlob.type,
    });

    await expect(openStagedPagePackage(file, descriptor, activeSignal)).rejects.toThrow(
      'digest does not match'
    );
  });
});
