import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebSnapshotCaptureMode } from '@sniptale/runtime-contracts/web-snapshot';

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

vi.mock('../../features/web-snapshot/provenance', () => ({
  sanitizeWebSnapshotManifestProvenance: (manifest: unknown) => manifest,
  sanitizeWebSnapshotPackageProvenance: (packageBlob: Blob, manifest: unknown) => ({
    manifest,
    packageBlob,
  }),
}));

vi.mock('./web-snapshot-validation', () => ({
  validateWebSnapshotPackage: mocks.validatePackage,
}));

function setupWebSnapshotQuotaTest() {
  vi.clearAllMocks();
  mocks.ensureHeadroom.mockReset();
  mocks.saveWebSnapshot.mockReset();
  mocks.validatePackage.mockReset();
  mocks.translate.mockImplementation((key: string) => {
    const translations: Record<string, string> = {
      'shared.storage.lowSpaceMiddle': 'available.',
      'shared.storage.lowSpacePrefix': 'Not enough storage:',
      'shared.storage.lowSpaceSuffix': 'Free up space and try again.',
    };

    return translations[key] ?? key;
  });
}

function createSavePayload() {
  return {
    packageBlob: new Blob(['package']),
    payload: {
      manifest: {
        captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
        capturedAt: '2026-03-23T05:30:00.000Z',
        id: 'snapshot-1',
        paths: {
          computedStyles: 'computed-styles.json',
          domSnapshot: 'dom.json',
          errors: 'errors.json',
          manifest: 'manifest.json',
          screenshot: 'screenshot.png',
          stylesheets: 'stylesheets.json',
          snapshotHtml: 'snapshot.html',
          virtualDomSnapshot: 'virtual-dom.json',
        },
        schemaVersion: 1 as const,
        source: { faviconUrl: null, title: 'Page', url: 'https://example.test' },
        stats: { assetCount: 0, failedAssetCount: 0, packageSize: 0 },
        warnings: [],
      },
      packageStagedBlobId: 'package-transfer',
      screenshotMimeType: 'image/png',
      screenshotStagedBlobId: 'screenshot-transfer',
      snapshotSessionId: 'session-1',
    },
    screenshotBlob: new Blob(['shot']),
  };
}

async function verifiesLocalizedWebSnapshotHeadroomFailure() {
  const { saveWebSnapshotToMediaHub } = await import('./web-snapshot');
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
    'ensure web snapshot storage headroom: Not enough storage: 20B available. Free up space and try again.'
  );
  expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
}

async function loadWebSnapshotOwner() {
  return import('./web-snapshot');
}

describe('web snapshot media hub quota boundary', () => {
  beforeEach(setupWebSnapshotQuotaTest);

  it(
    'surfaces low headroom as localized stage copy before saving media',
    verifiesLocalizedWebSnapshotHeadroomFailure
  );

  it('uses the source URL for the snapshot filename when the title is unavailable', async () => {
    const { saveWebSnapshotToMediaHub } = await loadWebSnapshotOwner();
    const input = createSavePayload();
    Object.assign(input.payload.manifest.source, {
      faviconUrl: null,
      title: null,
      url: 'https://example.com/docs',
    });
    mocks.saveWebSnapshot.mockResolvedValue({ assetId: 'asset-url' });

    await saveWebSnapshotToMediaHub(input);

    expect(mocks.saveWebSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'httpsexample.comdocs.sniptale-web-snapshot.zip' })
    );
  });

  it('preserves unrecognized failures inside the headroom stage boundary', async () => {
    const { saveWebSnapshotToMediaHub } = await loadWebSnapshotOwner();
    mocks.ensureHeadroom.mockRejectedValue(new Error('storage backend offline'));

    await expect(saveWebSnapshotToMediaHub(createSavePayload())).rejects.toThrow(
      'ensure web snapshot storage headroom: storage backend offline'
    );
    expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
  });

  it('normalizes non-Error persistence failures at the save stage boundary', async () => {
    const { saveWebSnapshotToMediaHub } = await loadWebSnapshotOwner();
    mocks.saveWebSnapshot.mockRejectedValue('write rejected');

    await expect(saveWebSnapshotToMediaHub(createSavePayload())).rejects.toThrow(
      'save web snapshot media asset: write rejected'
    );
  });
});
