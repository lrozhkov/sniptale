import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageCleanupCandidate } from '../../features/media-hub/types';

const storeMocks = vi.hoisted(() => ({
  deleteDiagnosticsMock: vi.fn(),
  deleteEditorSessionDraftMock: vi.fn(),
  deleteMediaLibraryAssetMock: vi.fn(),
  deleteMediaThumbnailMock: vi.fn(),
  deletePendingScenarioAssetMock: vi.fn(),
  deleteProjectAssetMock: vi.fn(),
  deleteRecordingMock: vi.fn(),
  deleteScenarioAssetMock: vi.fn(),
  deleteScenarioExportMock: vi.fn(),
  deleteScenarioStepEditorDocumentMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
}));

vi.mock('../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/media-library/index')>()),
  deleteMediaLibraryAsset: storeMocks.deleteMediaLibraryAssetMock,
  deleteMediaThumbnail: storeMocks.deleteMediaThumbnailMock,
}));

vi.mock('../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/index')>()),
  deleteRecording: storeMocks.deleteRecordingMock,
}));

vi.mock('../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/projects/index')>()),
  deleteProjectAsset: storeMocks.deleteProjectAssetMock,
}));

vi.mock('../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/projects')>()),
  deletePendingScenarioAsset: storeMocks.deletePendingScenarioAssetMock,
  deleteScenarioAsset: storeMocks.deleteScenarioAssetMock,
  deleteScenarioExport: storeMocks.deleteScenarioExportMock,
}));

vi.mock('../../composition/persistence/editor-sessions/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/editor-sessions/index')>()),
  deleteEditorSessionDraft: storeMocks.deleteEditorSessionDraftMock,
}));

vi.mock('../../composition/persistence/diagnostics/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/diagnostics/index')>()),
  deleteDiagnostics: storeMocks.deleteDiagnosticsMock,
}));

vi.mock(
  '../../composition/persistence/scenario/editor-documents/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/scenario/editor-documents/index')
    >()),
    deleteScenarioStepEditorDocument: storeMocks.deleteScenarioStepEditorDocumentMock,
  })
);

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: storeMocks.withMediaHubWriteGuardMock,
}));

vi.mock('./assembly', () => ({
  collectStorageCleanupReport: vi.fn(),
}));

vi.mock('../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal()),
  publishMediaHubLibraryChanged: storeMocks.publishMediaHubLibraryChangedMock,
}));

function createCleanupCandidate(
  id: string,
  target: StorageCleanupCandidate['target']
): StorageCleanupCandidate {
  return {
    createdAt: 1,
    filename: `${id}.bin`,
    id,
    kind: 'image',
    size: 1,
    target,
  };
}

function createCleanupCandidates() {
  return [
    createCleanupCandidate('asset-1', 'asset'),
    createCleanupCandidate('recording-1', 'recording'),
    createCleanupCandidate('project-asset-1', 'project-asset'),
    createCleanupCandidate('thumbnail-1', 'thumbnail'),
    createCleanupCandidate('session-1', 'editor-session'),
    createCleanupCandidate('pending-asset-1', 'scenario-pending-asset'),
    createCleanupCandidate('scenario-asset-1', 'scenario-asset'),
    createCleanupCandidate('scenario-export-1', 'scenario-export'),
    createCleanupCandidate('step-1', 'scenario-step-document'),
    createCleanupCandidate('diagnostics-1', 'diagnostics'),
  ];
}

function expectCleanupDeletes() {
  expect(storeMocks.deleteMediaLibraryAssetMock).toHaveBeenCalledWith('asset-1');
  expect(storeMocks.deleteRecordingMock).toHaveBeenCalledWith('recording-1');
  expect(storeMocks.deleteProjectAssetMock).toHaveBeenCalledWith('project-asset-1');
  expect(storeMocks.deleteMediaThumbnailMock).toHaveBeenCalledWith('thumbnail-1');
  expect(storeMocks.deleteEditorSessionDraftMock).toHaveBeenCalledWith('session-1');
  expect(storeMocks.deletePendingScenarioAssetMock).toHaveBeenCalledWith('pending-asset-1');
  expect(storeMocks.deleteScenarioAssetMock).toHaveBeenCalledWith('scenario-asset-1');
  expect(storeMocks.deleteScenarioExportMock).toHaveBeenCalledWith('scenario-export-1');
  expect(storeMocks.deleteScenarioStepEditorDocumentMock).toHaveBeenCalledWith('step-1');
  expect(storeMocks.deleteDiagnosticsMock).toHaveBeenCalledWith('diagnostics-1');
}

describe('media-hub typed storage cleanup deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.withMediaHubWriteGuardMock.mockImplementation(
      async (_operation: string, callback: () => Promise<unknown>) => callback()
    );
  });

  it('routes each cleanup target to its owning store delete API', async () => {
    const { deleteStorageCleanupCandidatesSafely } = await import('./store');

    await deleteStorageCleanupCandidatesSafely(createCleanupCandidates());

    expectCleanupDeletes();
    expect(storeMocks.withMediaHubWriteGuardMock).toHaveBeenCalledWith(
      'shared.mediaHub.deleteStorageCleanupAction',
      expect.any(Function)
    );
    expect(storeMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('cleanup', [
      'asset-1',
      'recording-1',
      'project-asset-1',
      'thumbnail-1',
      'session-1',
      'pending-asset-1',
      'scenario-asset-1',
      'scenario-export-1',
      'step-1',
      'diagnostics-1',
    ]);
  });
});
