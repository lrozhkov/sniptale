// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createPagePackageManifestFixture } from '../../features/web-snapshot/manifest.test-support';
import { hashWebSnapshotAssetBytes } from '../../features/web-snapshot/asset-manifest';
import { createViewerPackageFileCatalog, createViewerPackageFileExtractor } from './package-files';

async function createManifest() {
  const attachment = new TextEncoder().encode('report');
  const image = new TextEncoder().encode('image');
  return {
    attachment,
    image,
    manifest: createPagePackageManifestFixture({
      entries: [
        {
          component: 'attachments',
          mimeType: 'application/pdf',
          path: 'attachments/report.pdf',
          sha256: await hashWebSnapshotAssetBytes(attachment),
          size: attachment.byteLength,
        },
        {
          component: 'images',
          mimeType: 'image/png',
          path: 'exports/images/photo.png',
          sha256: await hashWebSnapshotAssetBytes(image),
          size: image.byteLength,
        },
        {
          component: 'webCopy',
          mimeType: 'image/png',
          path: 'page-screenshot.png',
          sha256: '0'.repeat(64),
          size: 0,
        },
      ],
    }),
  };
}

it('lists exported images and attachments without reading their archive entries', async () => {
  const { manifest } = await createManifest();

  expect(createViewerPackageFileCatalog(manifest)).toEqual([
    {
      kind: 'attachment',
      mimeType: 'application/pdf',
      name: 'report.pdf',
      path: 'attachments/report.pdf',
      size: 6,
    },
    {
      kind: 'exported-image',
      mimeType: 'image/png',
      name: 'photo.png',
      path: 'exports/images/photo.png',
      size: 5,
    },
  ]);
});

it('extracts and verifies exactly the selected package file', async () => {
  const { attachment, image, manifest } = await createManifest();
  const readEntry = vi.fn(async (path: string) =>
    path === 'attachments/report.pdf' ? attachment : image
  );
  const extract = createViewerPackageFileExtractor({ manifest, readEntry });

  const blob = await extract('attachments/report.pdf');

  expect(readEntry).toHaveBeenCalledExactlyOnceWith('attachments/report.pdf');
  expect(blob.size).toBe(attachment.byteLength);
  expect(blob.type).toBe('application/pdf');
  await expect(extract('assets/site.css')).rejects.toThrow('not available for download');
});

it('rejects a selected file whose bytes do not match the manifest', async () => {
  const { manifest } = await createManifest();
  const extract = createViewerPackageFileExtractor({
    manifest,
    readEntry: async () => new TextEncoder().encode('tampered'),
  });

  await expect(extract('attachments/report.pdf')).rejects.toThrow(
    'Page Package entry metadata does not match'
  );
});
