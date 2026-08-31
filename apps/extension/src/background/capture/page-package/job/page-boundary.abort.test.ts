import { expect, it, vi } from 'vitest';
import { hashWebSnapshotAssetBytes } from '../../../../features/web-snapshot/asset-manifest';
import { createPagePackageArchiveFixture } from '../../../../features/web-snapshot/package.test-support';
import type { ArchiveEntrySource, ArchiveReader } from '../../../../composition/archive-transfer';
import { PAGE_PACKAGE_ARCHIVE_PATHS } from '@sniptale/runtime-contracts/page-package';

const openArchiveReaderMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../composition/archive-transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/archive-transfer')>()),
  openArchiveReader: openArchiveReaderMock,
}));

import { openStagedPagePackage, type StagedPagePackageDescriptor } from './page-boundary';

it('aborts hostile entry validation and closes the archive reader', async () => {
  const fixture = await createPagePackageArchiveFixture({ manifest: { intent: 'export' } });
  const manifestText = `${JSON.stringify(fixture.manifest, null, 2)}\n`;
  const manifestBytes = new TextEncoder().encode(manifestText);
  const descriptor: StagedPagePackageDescriptor = {
    jobId: 'job-abort',
    manifestSha256: await hashWebSnapshotAssetBytes(manifestBytes),
    manifestSize: manifestBytes.byteLength,
    ordinal: 0,
    pageId: fixture.manifest.id,
    producerStats: { filesCount: 1, filesFailed: 0, rowsCount: 1, sectionsCount: 1 },
    stagedBlobId: 'stage-abort',
    title: fixture.manifest.source.title,
    totalBytes: fixture.manifest.stats.totalBytes + manifestBytes.byteLength,
  };
  let observedSignal: AbortSignal | undefined;
  const pipeTo = vi.fn(
    (_destination: WritableStream<Uint8Array>, signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        observedSignal = signal;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })
  );
  const entrySources = new Map<string, ArchiveEntrySource>(
    fixture.manifest.entries.map((entry) => [
      entry.path,
      {
        path: entry.path,
        pipeTo,
        size: entry.size,
        text: vi.fn(),
      } as unknown as ArchiveEntrySource,
    ])
  );
  const manifestSource = {
    path: PAGE_PACKAGE_ARCHIVE_PATHS.manifest,
    size: manifestBytes.byteLength,
    text: vi.fn(async () => manifestText),
  } as unknown as ArchiveEntrySource;
  const close = vi.fn(async () => undefined);
  const reader = {
    close,
    entries: () => [manifestSource, ...entrySources.values()],
    entry: (path: string) =>
      path === PAGE_PACKAGE_ARCHIVE_PATHS.manifest
        ? manifestSource
        : (entrySources.get(path) ?? null),
  } as ArchiveReader;
  openArchiveReaderMock.mockResolvedValueOnce(reader);
  const controller = new AbortController();

  const opening = openStagedPagePackage(
    new File(['archive'], 'hostile.page-package'),
    descriptor,
    controller.signal
  );
  await vi.waitFor(() => expect(pipeTo).toHaveBeenCalledOnce());
  controller.abort(new DOMException('cancelled', 'AbortError'));

  await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
  expect(observedSignal).toBe(controller.signal);
  expect(close).toHaveBeenCalledOnce();
});
