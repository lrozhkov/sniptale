import { beforeEach, expect, it, vi } from 'vitest';

const mediaHubStoreMocks = vi.hoisted(() => ({
  addMediaLibraryEntryTagsMock: vi.fn(),
  prepare: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
}));

vi.mock('../sync-transfer/editing-admission', () => ({
  runWithNativePublicationResources: mediaHubStoreMocks.prepare,
}));

vi.mock('../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/media-library/index')>()),
  addMediaLibraryEntryTags: mediaHubStoreMocks.addMediaLibraryEntryTagsMock,
  deleteMediaLibraryAsset: vi.fn(),
  deleteMediaThumbnail: vi.fn(),
  saveScreenshotMediaAsset: vi.fn(),
  updateMediaLibraryEntry: vi.fn(),
}));

vi.mock('../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/index')>()),
  deleteRecording: vi.fn(),
  saveRecording: vi.fn(),
}));

vi.mock('../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/telemetry')>()),
  saveRecordingTelemetry: vi.fn(),
}));

vi.mock('../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/projects/index')>()),
  commitProjectExport: vi.fn(),
  deleteProjectAsset: vi.fn(),
  saveProjectAsset: vi.fn(),
}));

vi.mock('../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/projects')>()),
  deletePendingScenarioAsset: vi.fn(),
  deleteScenarioAsset: vi.fn(),
  deleteScenarioExport: vi.fn(),
}));

vi.mock('../../composition/persistence/diagnostics/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/diagnostics/index')>()),
  deleteDiagnostics: vi.fn(),
}));

vi.mock(
  '../../composition/persistence/scenario/editor-documents/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/scenario/editor-documents/index')
    >()),
    deleteScenarioStepEditorDocument: vi.fn(),
  })
);

vi.mock('../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/web-snapshots')>()),
  saveWebSnapshotMediaAsset: vi.fn(),
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/events')>()),
  publishMediaHubLibraryChanged: mediaHubStoreMocks.publishMediaHubLibraryChangedMock,
}));

vi.mock('../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: mediaHubStoreMocks.withMediaHubWriteGuardMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mediaHubStoreMocks.prepare.mockImplementation(async (_roots, action: () => Promise<unknown>) =>
    action()
  );
  mediaHubStoreMocks.withMediaHubWriteGuardMock.mockImplementation(
    async (_operation: string, callback: () => Promise<unknown>) => callback()
  );
});

it('merges media tags through the guarded media-hub owner and publishes an update', async () => {
  const { addMediaLibraryEntryTagsSafely } = await import('./store');

  await addMediaLibraryEntryTagsSafely('asset-1', ['demo']);

  expect(mediaHubStoreMocks.withMediaHubWriteGuardMock).toHaveBeenCalledWith(
    'shared.mediaHub.updateMediaMetadataAction',
    expect.any(Function)
  );
  expect(mediaHubStoreMocks.addMediaLibraryEntryTagsMock).toHaveBeenCalledWith('asset-1', ['demo']);
  expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    'asset-1',
  ]);
});

it('does not change tags or publish an event when original preparation is refused', async () => {
  const { addMediaLibraryEntryTagsSafely } = await import('./store');
  mediaHubStoreMocks.prepare.mockRejectedValueOnce(new Error('temporary refusal'));
  await expect(addMediaLibraryEntryTagsSafely('asset-1', ['demo'])).rejects.toThrow(
    'temporary refusal'
  );
  expect(mediaHubStoreMocks.addMediaLibraryEntryTagsMock).not.toHaveBeenCalled();
  expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
  await addMediaLibraryEntryTagsSafely('asset-1', ['demo']);
  expect(mediaHubStoreMocks.addMediaLibraryEntryTagsMock).toHaveBeenCalledExactlyOnceWith(
    'asset-1',
    ['demo']
  );
});
