import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';

const persistenceMocks = vi.hoisted(() => ({
  listEditorSessionDrafts: vi.fn(),
  listMediaLibrary: vi.fn(),
  listScenarioProjectEntries: vi.fn(),
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
  listMediaLibrary: persistenceMocks.listMediaLibrary,
}));
vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  listVideoProjectEntries: persistenceMocks.listVideoProjectEntries,
}));
vi.mock('../scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/projects')>()),
  listScenarioProjectEntries: persistenceMocks.listScenarioProjectEntries,
}));

import { cleanupDrafts, createLibraryLifecycle, DEFAULT_LOCAL_STORAGE_POLICY } from '.';

const day = 24 * 60 * 60 * 1000;

function createSession(args: { assetId: string | null; sessionId: string; updatedAt: number }) {
  return {
    assetId: args.assetId,
    createdAt: 1,
    dirty: true,
    document: createEditorDocumentFixture(),
    lifecycle: createLibraryLifecycle('temporary', args.updatedAt),
    sessionId: args.sessionId,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: args.updatedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  persistenceMocks.listEditorSessionDrafts.mockResolvedValue([]);
  persistenceMocks.listMediaLibrary.mockResolvedValue([]);
  persistenceMocks.listScenarioProjectEntries.mockResolvedValue([]);
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([]);
});

it('keeps expired media when its linked editor session was recently autosaved', async () => {
  const now = 40 * day;
  const media = {
    createdAt: 1,
    duration: null,
    filename: 'draft.png',
    height: 1,
    id: 'draft-image',
    kind: 'image' as const,
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'image/png',
    originalFilename: 'draft.png',
    size: 5,
    source: { kind: 'screenshot' as const },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: 1,
  };
  const freshSession = createSession({
    assetId: media.id,
    sessionId: 'fresh-linked-session',
    updatedAt: now - day,
  });
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  const deletes = vi.fn();
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn((id: string) => deletes(name, id)),
          get: vi.fn(async () => (name === 'media_library' ? media : undefined)),
          getAll: vi.fn(async () => (name === 'editor_sessions' ? [freshSession] : [])),
        })),
      })),
    })
  );

  await expect(cleanupDrafts({ now, policy: DEFAULT_LOCAL_STORAGE_POLICY })).resolves.toEqual({
    deletedCount: 0,
    deletedIds: [],
  });
  expect(deletes).not.toHaveBeenCalled();
});

it('keeps a session that became linked after the cleanup snapshot', async () => {
  const now = 40 * day;
  const snapshot = createSession({
    assetId: null,
    sessionId: 'linked-during-cleanup',
    updatedAt: 1,
  });
  const current = { ...snapshot, assetId: 'draft-image' };
  persistenceMocks.listEditorSessionDrafts.mockResolvedValue([snapshot]);
  const deleteSession = vi.fn();
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn(() => ({
          delete: deleteSession,
          get: vi.fn(async () => current),
        })),
      })),
    })
  );

  await expect(cleanupDrafts({ now, policy: DEFAULT_LOCAL_STORAGE_POLICY })).resolves.toEqual({
    deletedCount: 0,
    deletedIds: [],
  });
  expect(deleteSession).not.toHaveBeenCalled();
});

it.each([
  ['fresh temporary', createLibraryLifecycle('temporary', 39 * day)],
  ['library', createLibraryLifecycle('library', 1)],
])('keeps stale recording media when its authoritative recording is %s', async (_, lifecycle) => {
  const now = 40 * day;
  const recording = {
    blob: new Blob(['video'], { type: 'video/webm' }),
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    lifecycle,
    size: 5,
  };
  const media = {
    blob: recording.blob,
    createdAt: 1,
    duration: null,
    filename: recording.filename,
    height: null,
    id: 'recording:recording-1',
    kind: 'recording' as const,
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'video/webm',
    originalFilename: recording.filename,
    size: recording.size,
    source: { kind: 'recording' as const, recordingId: recording.id },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: null,
  };
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  const deletes = vi.fn();
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn((id: string) => deletes(name, id)),
          get: vi.fn(async () =>
            name === 'media_library' ? media : name === 'recordings' ? recording : undefined
          ),
          getAll: vi.fn(async () => []),
        })),
      })),
    })
  );

  await expect(cleanupDrafts({ now, policy: DEFAULT_LOCAL_STORAGE_POLICY })).resolves.toEqual({
    deletedCount: 0,
    deletedIds: [],
  });
  expect(deletes).not.toHaveBeenCalled();
});

async function runExpiredVideoProjectCleanup(args: {
  mediaUpdatedAt: number;
  now: number;
  session?: ReturnType<typeof createSession>;
}) {
  const project = {
    ...createVideoProjectEntryWithMediaClip(),
    lifecycle: createLibraryLifecycle('temporary', 1),
  };
  const media = {
    createdAt: 1,
    duration: 10,
    filename: 'project-asset.webm',
    height: 1080,
    id: 'project-asset:project-asset-1',
    kind: 'video' as const,
    lifecycle: createLibraryLifecycle('temporary', args.mediaUpdatedAt),
    mimeType: 'video/webm',
    originalFilename: 'project-asset.webm',
    size: 5,
    source: { kind: 'project-asset' as const, projectAssetId: 'project-asset-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: args.mediaUpdatedAt,
    width: 1920,
  };
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([project]);
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  persistenceMocks.listEditorSessionDrafts.mockResolvedValue(args.session ? [args.session] : []);
  const deletes = vi.fn();
  const valuesByStore = new Map<string, Map<string, unknown>>([
    ['video_projects', new Map([[project.id, project]])],
    ['media_library', new Map([[media.id, media]])],
    ['project_assets', new Map([['project-asset-1', { id: 'project-asset-1' }]])],
    ['editor_sessions', new Map(args.session ? [[args.session.sessionId, args.session]] : [])],
  ]);
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn(async (id: string) => {
            deletes(name, id);
            valuesByStore.get(name)?.delete(id);
          }),
          get: vi.fn(async (id: string) => valuesByStore.get(name)?.get(id)),
          getAll: vi.fn(async () => [...(valuesByStore.get(name)?.values() ?? [])]),
        })),
      })),
    })
  );

  await expect(
    cleanupDrafts({ now: args.now, policy: DEFAULT_LOCAL_STORAGE_POLICY })
  ).resolves.toEqual({
    deletedCount: 1,
    deletedIds: [`video-project:${project.id}`],
  });
  return { deletes, media, project };
}

it('keeps a fresh temporary child when its video project has expired', async () => {
  const now = 40 * day;
  const { deletes, media, project } = await runExpiredVideoProjectCleanup({
    mediaUpdatedAt: now - day,
    now,
  });

  expect(deletes).toHaveBeenCalledWith('video_projects', project.id);
  expect(deletes).not.toHaveBeenCalledWith('media_library', media.id);
  expect(deletes).not.toHaveBeenCalledWith('project_assets', 'project-asset-1');
});

it('keeps an expired child protected by a recently autosaved linked session', async () => {
  const now = 40 * day;
  const session = createSession({
    assetId: 'project-asset:project-asset-1',
    sessionId: 'fresh-project-session',
    updatedAt: now - day,
  });
  const { deletes, media } = await runExpiredVideoProjectCleanup({
    mediaUpdatedAt: 1,
    now,
    session,
  });

  expect(deletes).not.toHaveBeenCalledWith('media_library', media.id);
  expect(deletes).not.toHaveBeenCalledWith('project_assets', 'project-asset-1');
  expect(deletes).not.toHaveBeenCalledWith('editor_sessions', session.sessionId);
});

it('removes recording telemetry and the project thumbnail with an expired recording graph', async () => {
  const now = 40 * day;
  const project = createVideoProjectEntry(
    {
      baseRecordingId: 'recording-1',
      source: { kind: 'recording', recordingId: 'recording-1' },
    },
    { lifecycle: createLibraryLifecycle('temporary', 1) }
  );
  const recording = {
    blob: new Blob(['video'], { type: 'video/webm' }),
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    lifecycle: createLibraryLifecycle('temporary', 1),
    size: 5,
  };
  const media = {
    blob: recording.blob,
    createdAt: 1,
    duration: null,
    filename: recording.filename,
    height: null,
    id: 'recording:recording-1',
    kind: 'recording' as const,
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'video/webm',
    originalFilename: recording.filename,
    size: recording.size,
    source: { kind: 'recording' as const, recordingId: recording.id },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: null,
  };
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([project]);
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  const deletes = vi.fn();
  const valuesByStore = new Map<string, Map<string, unknown>>([
    ['video_projects', new Map([[project.id, project]])],
    ['media_library', new Map([[media.id, media]])],
    ['recordings', new Map([[recording.id, recording]])],
    ['editor_sessions', new Map()],
  ]);
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn(async (id: string) => {
            deletes(name, id);
            valuesByStore.get(name)?.delete(id);
          }),
          get: vi.fn(async (id: string) => valuesByStore.get(name)?.get(id)),
          getAll: vi.fn(async () => [...(valuesByStore.get(name)?.values() ?? [])]),
        })),
      })),
    })
  );

  await expect(cleanupDrafts({ now, policy: DEFAULT_LOCAL_STORAGE_POLICY })).resolves.toEqual({
    deletedCount: 1,
    deletedIds: [`video-project:${project.id}`],
  });
  expect(deletes).toHaveBeenCalledWith('media_library', media.id);
  expect(deletes).toHaveBeenCalledWith('recordings', recording.id);
  expect(deletes).toHaveBeenCalledWith('recording_telemetry', recording.id);
  expect(deletes).toHaveBeenCalledWith('thumbnails', `video-project:${project.id}`);
});
