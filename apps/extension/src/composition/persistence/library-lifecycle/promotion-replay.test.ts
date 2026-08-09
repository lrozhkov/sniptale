import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createScenarioProject } from '../../../features/scenario/project/factories/project';

const persistenceMocks = vi.hoisted(() => ({
  getMediaThumbnail: vi.fn(),
  listEditorSessionDrafts: vi.fn(),
  listMediaLibrary: vi.fn(),
  listScenarioAssets: vi.fn(),
  listScenarioExports: vi.fn(),
  listScenarioProjectEntries: vi.fn(),
  listScenarioStepEditorDocuments: vi.fn(),
  listVideoProjectEntries: vi.fn(),
  runWithIndexedDbMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: persistenceMocks.runWithIndexedDbMutation,
}));

vi.mock('../editor-sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor-sessions')>()),
  listEditorSessionDrafts: persistenceMocks.listEditorSessionDrafts,
}));
vi.mock('../media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library')>()),
  getMediaThumbnail: persistenceMocks.getMediaThumbnail,
  listMediaLibrary: persistenceMocks.listMediaLibrary,
}));
vi.mock('../scenario/editor-documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/editor-documents')>()),
  listScenarioStepEditorDocuments: persistenceMocks.listScenarioStepEditorDocuments,
}));
vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  listVideoProjectEntries: persistenceMocks.listVideoProjectEntries,
}));
vi.mock('../scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/projects')>()),
  listScenarioAssets: persistenceMocks.listScenarioAssets,
  listScenarioExports: persistenceMocks.listScenarioExports,
  listScenarioProjectEntries: persistenceMocks.listScenarioProjectEntries,
}));
import { createLibraryLifecycle, promoteStoredItem } from '.';

beforeEach(() => {
  vi.clearAllMocks();
  persistenceMocks.listEditorSessionDrafts.mockResolvedValue([]);
  persistenceMocks.getMediaThumbnail.mockResolvedValue(undefined);
  persistenceMocks.listMediaLibrary.mockResolvedValue([]);
  persistenceMocks.listScenarioAssets.mockResolvedValue([]);
  persistenceMocks.listScenarioExports.mockResolvedValue([]);
  persistenceMocks.listScenarioProjectEntries.mockResolvedValue([]);
  persistenceMocks.listScenarioStepEditorDocuments.mockResolvedValue([]);
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([]);
  persistenceMocks.runWithIndexedDbMutation.mockResolvedValue(true);
});

describe('library lifecycle project and editor promotion', () => {
  it('promotes temporary scenario rows and leaves library rows unchanged', async () => {
    const project = createScenarioProject('Scenario');
    const temporary = {
      createdAt: 10,
      id: project.id,
      lifecycle: createLibraryLifecycle('temporary', 10),
      project,
      updatedAt: 10,
    };
    const library = { ...temporary, lifecycle: createLibraryLifecycle('library', 10) };
    const values = [temporary, library];
    const put = vi.fn();
    persistenceMocks.runWithIndexedDbMutation.mockImplementation(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn(() => ({ get: vi.fn(async () => values.shift()), put })),
        })),
      })
    );

    await promoteStoredItem({ id: project.id, kind: 'scenario-project' });
    await promoteStoredItem({ id: project.id, kind: 'scenario-project' });

    expect(put).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: expect.objectContaining({ storageClass: 'library' }) })
    );
  });

  it('promotes project rows in place and treats legacy rows as already saved', async () => {
    const put = vi.fn();
    const temporary = createVideoProjectEntry(
      {},
      { lifecycle: createLibraryLifecycle('temporary', 10) }
    );
    const library = createVideoProjectEntry({ id: 'library-project' }, { id: 'library-project' });
    const values = [temporary, library];
    persistenceMocks.runWithIndexedDbMutation.mockImplementation(async (effect) => {
      const value = values.shift();
      return effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'video_projects'
              ? { get: vi.fn(async () => value), put }
              : name === 'media_library'
                ? { getAll: vi.fn(async () => []), put }
                : { get: vi.fn(async () => undefined), put }
          ),
        })),
      });
    });

    await promoteStoredItem({ id: temporary.id, kind: 'video-project' });
    await promoteStoredItem({ id: library.id, kind: 'video-project' });

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: temporary.id,
        lifecycle: expect.objectContaining({ storageClass: 'library' }),
      })
    );
  });

  it('preserves independently saved recording and project-asset child lifecycles', async () => {
    const base = createVideoProjectEntryWithMediaClip();
    const project = {
      ...base,
      lifecycle: createLibraryLifecycle('temporary', 10),
      project: {
        ...base.project,
        baseRecordingId: 'recording-1',
        source: { kind: 'recording' as const, recordingId: 'recording-1' },
      },
    };
    const recordingLifecycle = createLibraryLifecycle('library', 700);
    const assetLifecycle = createLibraryLifecycle('library', 800);
    const recording = {
      blob: new Blob(['recording']),
      createdAt: 10,
      filename: 'recording.webm',
      id: 'recording-1',
      lifecycle: recordingLifecycle,
      size: 9,
    };
    const mediaRows = [
      createMediaLibraryEntry({
        id: 'recording:recording-1',
        lifecycle: recordingLifecycle,
        source: { kind: 'recording', recordingId: 'recording-1' },
      }),
      createMediaLibraryEntry({
        id: 'project-asset:project-asset-1',
        lifecycle: assetLifecycle,
        source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
      }),
    ];
    const projectPut = vi.fn();
    const recordingPut = vi.fn();
    const mediaPut = vi.fn();
    vi.spyOn(Date, 'now').mockReturnValue(999);
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'video_projects'
              ? { get: vi.fn(async () => project), put: projectPut }
              : name === 'recordings'
                ? { get: vi.fn(async () => recording), put: recordingPut }
                : name === 'project_assets'
                  ? {
                      get: vi.fn(async () => ({
                        blob: new Blob(['asset']),
                        createdAt: 10,
                        id: 'project-asset-1',
                        mimeType: 'image/png',
                        size: 5,
                      })),
                    }
                  : { getAll: vi.fn(async () => mediaRows), put: mediaPut }
          ),
        })),
      })
    );

    await promoteStoredItem({ id: project.id, kind: 'video-project' });

    expect(recordingPut).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: recordingLifecycle })
    );
    expect(mediaPut).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ lifecycle: recordingLifecycle })
    );
    expect(mediaPut).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ lifecycle: assetLifecycle })
    );
    expect(projectPut).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: { savedAt: 999, storageClass: 'library', updatedAt: 999 },
      })
    );
  });

  it('reconciles temporary children when the video project is already in the library', async () => {
    const project = createVideoProjectEntry(
      { baseRecordingId: 'recording-1' },
      { lifecycle: createLibraryLifecycle('library', 100) }
    );
    const temporary = createLibraryLifecycle('temporary', 10);
    const recording = {
      blob: new Blob(['recording']),
      createdAt: 10,
      filename: 'recording.webm',
      id: 'recording-1',
      lifecycle: temporary,
      size: 9,
    };
    const recordingPut = vi.fn();
    const projectPut = vi.fn();
    vi.spyOn(Date, 'now').mockReturnValue(999);
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'video_projects'
              ? { get: vi.fn(async () => project), put: projectPut }
              : name === 'recordings'
                ? { get: vi.fn(async () => recording), put: recordingPut }
                : name === 'media_library'
                  ? { getAll: vi.fn(async () => []), put: vi.fn() }
                  : { get: vi.fn(async () => undefined) }
          ),
        })),
      })
    );

    await promoteStoredItem({ id: project.id, kind: 'video-project' });

    expect(recordingPut).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: { savedAt: 999, storageClass: 'library', updatedAt: 999 },
      })
    );
    expect(projectPut).not.toHaveBeenCalled();
  });

  it('fails promotion closed when the target row is absent', async () => {
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn(() => ({ get: vi.fn(async () => undefined), put: vi.fn() })),
        })),
      })
    );

    await expect(promoteStoredItem({ id: 'missing', kind: 'scenario-project' })).rejects.toThrow(
      'was not found'
    );
  });

  it('fails editor promotion before mutation when the workspace is absent', async () => {
    await expect(promoteStoredItem({ id: 'missing', kind: 'editor-session' })).rejects.toThrow(
      'was not found'
    );
    expect(persistenceMocks.runWithIndexedDbMutation).not.toHaveBeenCalled();
  });

  it('fails video-project promotion when the project row is absent', async () => {
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn(() => ({ get: vi.fn(async () => undefined) })),
        })),
      })
    );

    await expect(promoteStoredItem({ id: 'missing', kind: 'video-project' })).rejects.toThrow(
      'was not found'
    );
  });

  it('fails media promotion when the media row is absent', async () => {
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn(() => ({ get: vi.fn(async () => undefined) })),
        })),
      })
    );

    await expect(promoteStoredItem({ id: 'missing', kind: 'media' })).rejects.toThrow(
      'was not found'
    );
  });
});

describe('library lifecycle editor promotion', () => {
  it('promotes an unlinked editor session without replacing its workspace id', async () => {
    const session = {
      assetId: null,
      createdAt: 10,
      dirty: true,
      document: createEditorDocumentFixture(),
      lifecycle: createLibraryLifecycle('temporary', 10),
      sessionId: 'session-1',
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 10,
    };
    const put = vi.fn();
    persistenceMocks.listEditorSessionDrafts.mockResolvedValue([session]);
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'editor_sessions'
              ? { get: vi.fn(async () => session), put }
              : { get: vi.fn(async () => undefined), put }
          ),
        })),
      })
    );

    await promoteStoredItem({ id: session.sessionId, kind: 'editor-session' });

    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        assetId: 'editor-draft:session-1',
        lifecycle: expect.objectContaining({ storageClass: 'library' }),
      })
    );
  });

  it('does not overwrite a colliding media row during editor-session promotion', async () => {
    const session = {
      assetId: null,
      createdAt: 10,
      dirty: true,
      document: createEditorDocumentFixture(),
      lifecycle: createLibraryLifecycle('temporary', 10),
      sessionId: 'collision',
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 10,
    };
    const put = vi.fn();
    persistenceMocks.listEditorSessionDrafts.mockResolvedValue([session]);
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'editor_sessions'
              ? { get: vi.fn(async () => session), put }
              : { get: vi.fn(async () => ({ id: 'editor-draft:collision' })), put }
          ),
        })),
      })
    );

    await expect(
      promoteStoredItem({ id: session.sessionId, kind: 'editor-session' })
    ).rejects.toThrow('already exists');
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects editor promotion when the workspace changes after its snapshot', async () => {
    const snapshot = {
      assetId: null,
      createdAt: 10,
      dirty: true,
      document: createEditorDocumentFixture(),
      lifecycle: createLibraryLifecycle('temporary', 10),
      sessionId: 'changed',
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 10,
    };
    persistenceMocks.listEditorSessionDrafts.mockResolvedValue([snapshot]);
    for (const current of [
      { ...snapshot, assetId: 'new-asset' },
      { ...snapshot, updatedAt: 11 },
    ]) {
      persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
        effect({
          transaction: vi.fn(() => ({
            done: Promise.resolve(),
            objectStore: vi.fn(() => ({ get: vi.fn(async () => current), put: vi.fn() })),
          })),
        })
      );
      await expect(
        promoteStoredItem({ id: snapshot.sessionId, kind: 'editor-session' })
      ).rejects.toThrow('changed while it was being promoted');
    }
  });

  it('treats a repeated editor-session promotion as an idempotent library operation', async () => {
    const session = {
      assetId: 'editor-draft:replay',
      createdAt: 10,
      dirty: false,
      document: createEditorDocumentFixture(),
      lifecycle: createLibraryLifecycle('library', 10),
      sessionId: 'replay',
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 10,
    };
    const media = createMediaLibraryEntry({
      id: session.assetId,
      lifecycle: createLibraryLifecycle('library', 10),
      source: { kind: 'screenshot' },
    });
    persistenceMocks.listEditorSessionDrafts.mockResolvedValue([session]);
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'media_library'
              ? { get: vi.fn(async () => media), put: vi.fn() }
              : { getAll: vi.fn(async () => [session]), put: vi.fn() }
          ),
        })),
      })
    );

    await expect(
      promoteStoredItem({ id: session.sessionId, kind: 'editor-session' })
    ).resolves.toBeUndefined();
  });
});
