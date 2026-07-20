import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  ensureMediaHubStorageHeadroomMock,
  importMediaHubBackupAssetsMock,
  loadBackupPartsMock,
  translateMock,
} = vi.hoisted(() => ({
  ensureMediaHubStorageHeadroomMock: vi.fn(),
  importMediaHubBackupAssetsMock: vi.fn(),
  loadBackupPartsMock: vi.fn(),
  translateMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/format-bytes')>()),
  formatBytes: (value: number) => `${value}B`,
}));

vi.mock('../../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/media-hub/storage-capacity')>()),
  ensureMediaHubStorageHeadroom: ensureMediaHubStorageHeadroomMock,
}));

vi.mock('../restore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../restore')>()),
  importMediaHubBackupAssets: importMediaHubBackupAssetsMock,
}));

vi.mock('../manifest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../manifest')>()),
  loadBackupParts: loadBackupPartsMock,
}));

function setupBackupImportQuotaTest() {
  vi.clearAllMocks();
  ensureMediaHubStorageHeadroomMock.mockResolvedValue(undefined);
  translateMock.mockImplementation((key: string) => {
    const translations: Record<string, string> = {
      'shared.storage.lowSpaceMiddle': 'available.',
      'shared.storage.lowSpacePrefix': 'Not enough storage:',
      'shared.storage.lowSpaceSuffix': 'Free up space and try again.',
    };

    return translations[key] ?? key;
  });
  loadBackupPartsMock.mockResolvedValue({
    inflatedSizeBytes: 1234,
    metadata: { assets: [], effectBundles: [] },
    zip: {},
  });
  importMediaHubBackupAssetsMock.mockResolvedValue({
    conflictsResolved: 0,
    imported: 0,
    skipped: 0,
  });
}

async function verifiesHeadroomBeforeRestoreWrites() {
  const { importMediaHubBackup } = await import('..');

  await expect(importMediaHubBackup(new Blob(['zip']), 'duplicate')).resolves.toEqual({
    conflictsResolved: 0,
    imported: 0,
    skipped: 0,
  });

  expect(ensureMediaHubStorageHeadroomMock).toHaveBeenCalledWith(1234);
  expect(importMediaHubBackupAssetsMock).toHaveBeenCalledTimes(1);
}

async function verifiesLocalizedHeadroomFailureBeforeRestoreWrites() {
  const { importMediaHubBackup } = await import('..');
  ensureMediaHubStorageHeadroomMock.mockRejectedValue({
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

  await expect(importMediaHubBackup(new Blob(['zip']), 'duplicate')).rejects.toThrow(
    'Not enough storage: 20B available. Free up space and try again.'
  );

  expect(importMediaHubBackupAssetsMock).not.toHaveBeenCalled();
}

async function verifiesUnknownHeadroomFailurePassThrough() {
  const { importMediaHubBackup } = await import('..');
  const error = new Error('storage unavailable');
  ensureMediaHubStorageHeadroomMock.mockRejectedValue(error);

  await expect(importMediaHubBackup(new Blob(['zip']), 'duplicate')).rejects.toBe(error);
  expect(importMediaHubBackupAssetsMock).not.toHaveBeenCalled();
}

describe('media hub backup import quota preflight', () => {
  beforeEach(setupBackupImportQuotaTest);

  it('checks storage headroom before starting restore writes', verifiesHeadroomBeforeRestoreWrites);
  it(
    'does not start restore writes when storage headroom fails',
    verifiesLocalizedHeadroomFailureBeforeRestoreWrites
  );
  it(
    'passes through unknown headroom failures before restore writes',
    verifiesUnknownHeadroomFailurePassThrough
  );
});
