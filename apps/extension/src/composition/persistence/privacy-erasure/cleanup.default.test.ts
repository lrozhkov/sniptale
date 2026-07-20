import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserStorageAreaMock,
  consumePersistedEditorBootstrapPayloadMock,
  eraseEditorBootstrapRetentionDataMock,
  eraseSniptaleDatabaseForPrivacyErasureMock,
  initializeEditorBootstrapRetentionMock,
  persistEditorBootstrapPayloadMock,
  purgeExpiredEditorBootstrapRetentionDataMock,
  verifyEditorBootstrapRetentionEmptyMock,
  verifySniptaleDatabaseAbsentAfterPrivacyErasureMock,
  eraseVideoPreviewCacheForPrivacyErasureMock,
  verifyVideoPreviewCacheEmptyAfterPrivacyErasureMock,
} = vi.hoisted(() => ({
  browserStorageAreaMock: {
    get: vi.fn(),
    isAvailable: vi.fn(),
    remove: vi.fn(),
    set: vi.fn(),
  },
  consumePersistedEditorBootstrapPayloadMock: vi.fn(),
  eraseEditorBootstrapRetentionDataMock: vi.fn(),
  eraseSniptaleDatabaseForPrivacyErasureMock: vi.fn(),
  initializeEditorBootstrapRetentionMock: vi.fn(),
  persistEditorBootstrapPayloadMock: vi.fn(),
  purgeExpiredEditorBootstrapRetentionDataMock: vi.fn(),
  verifyEditorBootstrapRetentionEmptyMock: vi.fn(),
  verifySniptaleDatabaseAbsentAfterPrivacyErasureMock: vi.fn(),
  eraseVideoPreviewCacheForPrivacyErasureMock: vi.fn(),
  verifyVideoPreviewCacheEmptyAfterPrivacyErasureMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage/privacy-erasure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage/privacy-erasure')>()),
  privacyErasureBrowserStorage: {
    local: browserStorageAreaMock,
    session: browserStorageAreaMock,
    sync: browserStorageAreaMock,
  },
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  eraseSniptaleDatabaseForPrivacyErasure: eraseSniptaleDatabaseForPrivacyErasureMock,
  verifySniptaleDatabaseAbsentAfterPrivacyErasure:
    verifySniptaleDatabaseAbsentAfterPrivacyErasureMock,
}));
vi.mock('../editor-bootstrap/retention', () => ({
  consumePersistedEditorBootstrapPayload: consumePersistedEditorBootstrapPayloadMock,
  eraseEditorBootstrapRetentionData: eraseEditorBootstrapRetentionDataMock,
  initializeEditorBootstrapRetention: initializeEditorBootstrapRetentionMock,
  persistEditorBootstrapPayload: persistEditorBootstrapPayloadMock,
  purgeExpiredEditorBootstrapRetentionData: purgeExpiredEditorBootstrapRetentionDataMock,
  verifyEditorBootstrapRetentionEmpty: verifyEditorBootstrapRetentionEmptyMock,
}));
vi.mock('../video-preview-cache/privacy-erasure', () => ({
  eraseVideoPreviewCacheForPrivacyErasure: eraseVideoPreviewCacheForPrivacyErasureMock,
  verifyVideoPreviewCacheEmptyAfterPrivacyErasure:
    verifyVideoPreviewCacheEmptyAfterPrivacyErasureMock,
}));

import { erasePersistentLocalExtensionData } from './cleanup';

beforeEach(() => {
  vi.clearAllMocks();
  browserStorageAreaMock.get.mockResolvedValue({});
  browserStorageAreaMock.isAvailable.mockReturnValue(true);
  browserStorageAreaMock.remove.mockResolvedValue(undefined);
  eraseEditorBootstrapRetentionDataMock.mockResolvedValue(undefined);
  eraseSniptaleDatabaseForPrivacyErasureMock.mockResolvedValue(undefined);
  verifyEditorBootstrapRetentionEmptyMock.mockResolvedValue(true);
  verifySniptaleDatabaseAbsentAfterPrivacyErasureMock.mockResolvedValue(true);
  eraseVideoPreviewCacheForPrivacyErasureMock.mockResolvedValue(undefined);
  verifyVideoPreviewCacheEmptyAfterPrivacyErasureMock.mockResolvedValue(true);
});

it('clears IndexedDB through the default database adapter', async () => {
  await erasePersistentLocalExtensionData({
    includeAiProviderSecrets: false,
    preservePreferences: true,
  });

  expect(eraseSniptaleDatabaseForPrivacyErasureMock).toHaveBeenCalledOnce();
  expect(verifySniptaleDatabaseAbsentAfterPrivacyErasureMock).toHaveBeenCalledTimes(2);
  expect(eraseEditorBootstrapRetentionDataMock).toHaveBeenCalledOnce();
  expect(verifyEditorBootstrapRetentionEmptyMock).toHaveBeenCalledTimes(2);
  expect(eraseVideoPreviewCacheForPrivacyErasureMock).toHaveBeenCalledOnce();
  expect(verifyVideoPreviewCacheEmptyAfterPrivacyErasureMock).toHaveBeenCalledTimes(2);
  expect(browserStorageAreaMock.remove).toHaveBeenCalled();
});

it('reports failed verification when the default database adapter still observes the database', async () => {
  verifySniptaleDatabaseAbsentAfterPrivacyErasureMock.mockResolvedValueOnce(false);

  const result = await erasePersistentLocalExtensionData({
    includeAiProviderSecrets: false,
    preservePreferences: true,
  });

  expect(result.success).toBe(false);
  expect(result.failedRequiredParticipantIds).toContain('indexed-db:core');
});
