import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import { createPagePackageManifestFixture } from '../../features/web-snapshot/manifest.test-support';

const mocks = vi.hoisted(() => ({
  ensureHeadroom: vi.fn(),
  saveWebSnapshot: vi.fn(),
  translate: vi.fn(),
  validatePackage: vi.fn(),
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: mocks.translate,
}));

vi.mock('../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n/format-bytes')>()),
  formatBytes: (value: number) => `${value}B`,
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  saveWebSnapshotMediaAssetSafely: mocks.saveWebSnapshot,
}));

vi.mock('../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/storage-capacity')>()),
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroom,
}));

vi.mock('../../features/web-snapshot/provenance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/web-snapshot/provenance')>()),
  sanitizeWebSnapshotManifestProvenance: (manifest: unknown) => manifest,
  sanitizeWebSnapshotPackageProvenance: (packageBlob: Blob, manifest: unknown) => ({
    manifest,
    packageBlob,
  }),
}));

vi.mock('./web-snapshot-validation', () => ({
  validateWebSnapshotPackage: mocks.validatePackage,
}));

import { saveWebSnapshotToMediaHub } from './web-snapshot';

function setupWebSnapshotQuotaTest() {
  vi.clearAllMocks();
  mocks.ensureHeadroom.mockReset();
  mocks.saveWebSnapshot.mockReset();
  mocks.validatePackage.mockReset();
  mocks.translate.mockImplementation((key: string) => {
    const translations: Record<string, string> = {
      'shared.storage.lowSpaceMiddle': 'available.',
      'shared.storage.lowSpacePrefix': 'Not enough storage:',
      'shared.storage.lowSpaceSuffix': 'Delete unneeded items in Library and try again.',
    };

    return translations[key] ?? key;
  });
}

function createSavePayload() {
  return {
    assertPersistenceAllowed: vi.fn().mockResolvedValue(undefined),
    packageBlob: new Blob(['package'], { type: PAGE_PACKAGE_ARCHIVE_MIME_TYPE }),
    payload: {
      manifest: createPagePackageManifestFixture({
        source: { faviconUrl: null, title: 'Page', url: 'https://example.test' },
      }),
      packageStagedBlobId: 'package-transfer',
      screenshotMimeType: 'image/png',
      screenshotStagedBlobId: 'screenshot-transfer',
      snapshotSessionId: 'session-1',
    },
    screenshotBlob: new Blob(['shot'], { type: 'image/png' }),
  };
}

async function verifiesLocalizedWebSnapshotHeadroomFailure() {
  mocks.ensureHeadroom.mockRejectedValue({
    isStorageQuotaHeadroomError: true,
    payload: {
      estimate: {
        isPersistent: false,
        pressure: 'critical',
        quota: 1000,
        remaining: 20,
        usage: 980,
        usageRatio: 0.98,
      },
      kind: 'storage-headroom-low',
      requiredFreeBytes: 50,
    },
  });

  await expect(saveWebSnapshotToMediaHub(createSavePayload())).rejects.toThrow(
    'ensure web snapshot storage headroom: Not enough storage: 20B available. Delete unneeded items in Library and try again.'
  );
  expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
}

describe('web snapshot media hub quota boundary', () => {
  beforeEach(setupWebSnapshotQuotaTest);

  it(
    'surfaces low headroom as localized stage copy before saving media',
    verifiesLocalizedWebSnapshotHeadroomFailure
  );

  it('uses the source URL for the snapshot filename when the title is unavailable', async () => {
    const input = createSavePayload();
    Object.assign(input.payload.manifest.source, {
      faviconUrl: null,
      title: null,
      url: 'https://example.com/docs',
    });
    mocks.saveWebSnapshot.mockResolvedValue({ assetId: 'asset-url' });

    await saveWebSnapshotToMediaHub(input);

    expect(mocks.saveWebSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'httpsexample.comdocs.sniptale-page-package.zip' }),
      expect.any(Function)
    );
  });

  it.each([
    'Web snapshot screenshot is invalid.',
    'Web snapshot screenshot dimensions exceed safe limits.',
  ])('does not check storage or save when screenshot admission rejects: %s', async (message) => {
    mocks.validatePackage.mockRejectedValue(new Error(message));

    await expect(saveWebSnapshotToMediaHub(createSavePayload())).rejects.toThrow(message);

    expect(mocks.ensureHeadroom).not.toHaveBeenCalled();
    expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
  });

  it('preserves unrecognized failures inside the headroom stage boundary', async () => {
    mocks.ensureHeadroom.mockRejectedValue(new Error('storage backend offline'));

    await expect(saveWebSnapshotToMediaHub(createSavePayload())).rejects.toThrow(
      'ensure web snapshot storage headroom: storage backend offline'
    );
    expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
  });

  it('normalizes non-Error persistence failures at the save stage boundary', async () => {
    mocks.saveWebSnapshot.mockRejectedValue('write rejected');

    await expect(saveWebSnapshotToMediaHub(createSavePayload())).rejects.toThrow(
      'save web snapshot media asset: write rejected'
    );
  });
});
