import { expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import { appendBackupAssetDescriptor } from './index';
import { createBackupExportBudget } from '../export/blob/budget';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('sanitizes legacy source provenance before writing backup metadata descriptors', async () => {
  const assets: Parameters<typeof appendBackupAssetDescriptor>[0]['assets'] = [];

  await appendBackupAssetDescriptor({
    assets,
    budget: createBackupExportBudget(),
    db: createDb(),
    encodePathSegment: encodeURIComponent,
    entry: createLegacyEntry(),
    thumbnailCount: 0,
    zip: { file: vi.fn() },
  });

  expect(assets[0]?.entry).toEqual(
    expect.objectContaining({
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceUrl: 'https://example.com/',
    })
  );
});

function createLegacyEntry(): MediaLibraryEntry {
  return {
    blob: new Blob(['asset']),
    createdAt: 10,
    duration: null,
    filename: 'asset.png',
    height: 1080,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 123,
    source: { kind: 'screenshot' },
    sourceFavicon: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
    sourceTitle: null,
    sourceUrl: 'https://user:pass@example.com/reset/password?token=secret#access_token=abc',
    tags: [],
    updatedAt: 20,
    width: 1920,
  };
}

function createDb() {
  return {
    get: vi.fn(async () => undefined),
  };
}
