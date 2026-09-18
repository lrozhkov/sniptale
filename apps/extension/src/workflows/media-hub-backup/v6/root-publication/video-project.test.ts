import { beforeEach, expect, it, vi } from 'vitest';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../../../composition/persistence/projects/index.test-support';
import { assertPortableJson } from '../codec';
import { encodePortableVideoProjectAssetRefs } from '../root-codecs/projects';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), checkpoint: vi.fn() }));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.mutate,
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
}));
import { videoProjectRootPublisher } from './video-project';

beforeEach(() => vi.clearAllMocks());

it.each([true, false])(
  'duplicates project export/review with explicit MIME=%s',
  async (explicitMime) => {
    const values = new Map<string, unknown[]>();
    const store = (name: string) => ({
      get: async () => undefined,
      getAll: async () => [],
      put: async (value: unknown) => {
        values.set(name, [...(values.get(name) ?? []), value]);
      },
      delete: async () => undefined,
      index: () => ({ getAll: async () => [], count: async () => 0 }),
    });
    mocks.mutate.mockImplementation(async (callback) =>
      callback({
        get: async () => undefined,
        transaction: () => ({ objectStore: store, done: Promise.resolve() }),
      })
    );
    const annotation = { id: 'a', text: 'Point comment', anchor: { kind: 'point', time: 1 } };
    const history = [{ id: 'op', at: 1, target: 'annotation', before: null, after: annotation }];
    const metadata = {
      entry: createVideoProjectEntry({ id: 'p' }, { id: 'p' }),
      projectAssets: [],
      projectExports: [
        {
          entry: {
            id: 'e',
            projectId: 'p',
            createdAt: 1,
            filename: 'result.webm',
            ...(explicitMime ? { mimeType: 'video/webm' } : {}),
            size: 6,
            duration: 2,
            width: 640,
            height: 360,
            fps: 30,
          },
          objectId: 'o',
          videoReview: {
            workspace: {
              aggregateId: 'export:e',
              formatVersion: 1,
              source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
              revision: 3,
              cursor: 0,
              history,
              createdAt: 1,
              updatedAt: 2,
            },
            draft: {
              aggregateId: 'export:e',
              revision: 1,
              annotation: { ...annotation, text: 'Recovery' },
              before: null,
              updatedAt: 2,
            },
          },
        },
      ],
    };
    assertPortableJson(metadata);
    const result = await videoProjectRootPublisher.publish({
      envelope: {
        descriptor: {
          rootKind: 'video-project',
          rootId: 'p',
          metadataPath: '_sniptale/metadata/projects/p.json',
          objectCount: 1,
          totalBytes: 6,
        },
        metadata,
        objects: [],
      },
      journal: {
        assetRefs: [],
        createdAt: 1,
        domain: 'archive-restore',
        journalId: 'j',
        payload: {},
      },
      session: {
        archiveFingerprint: 'a'.repeat(64),
        committedRoots: [],
        conflictedRoots: [],
        createdAt: 1,
        currentRoot: 'video-project:p',
        kind: 'archive-restore-session',
        operationId: 'restore',
        rootIdMap: {},
        skippedRoots: [],
        status: 'pending',
        strategy: 'duplicate',
        updatedAt: 1,
      },
      staged: [
        {
          objectId: 'o',
          ref: {
            assetId: 'new-local',
            createdAt: 1,
            location: { kind: 'opfs', objectKey: 'objects/new-local' },
            mimeType: 'video/webm',
            sha256: null,
            size: 6,
          },
        },
      ],
    });
    expect(result.imported).toBe(true);
    expect(values.get('video_workspaces')).toHaveLength(1);
    const workspace = values.get('video_workspaces')![0];
    expect(workspace).toMatchObject({ sourceAssetId: 'new-local', history, cursor: 0 });
    expect(workspace).not.toMatchObject({ aggregateId: 'export:e' });
    expect(values.get('video_workspace_drafts')).toEqual([
      expect.objectContaining({
        aggregateId: expect.stringMatching(/^export:/),
        annotation: { ...annotation, text: 'Recovery' },
      }),
    ]);
    expect(mocks.checkpoint).toHaveBeenCalledOnce();
  }
);

it('duplicates review audio references to the restored asset ids', async () => {
  const values = new Map<string, unknown[]>();
  const store = (name: string) => ({
    get: async () => undefined,
    getAll: async () => [],
    put: async (value: unknown) => {
      values.set(name, [...(values.get(name) ?? []), value]);
    },
    delete: async () => undefined,
    index: () => ({ getAll: async () => [], count: async () => 0 }),
  });
  mocks.mutate.mockImplementation(async (callback) =>
    callback({
      get: async () => undefined,
      transaction: () => ({ objectStore: store, done: Promise.resolve() }),
    })
  );
  const musicAssetId = 'project-asset:music';
  const base = createVideoProjectEntryWithMediaClip();
  const metadata = {
    entry: {
      id: 'p',
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      workspaceRevision: base.workspaceRevision,
      project: encodePortableVideoProjectAssetRefs({
        ...base.project,
        id: 'p',
      }) as typeof base.project,
    },
    projectAssets: [
      {
        entry: { id: 'music', mimeType: 'audio/mpeg', createdAt: 1, size: 8 },
        filename: 'theme.mp3',
        objectId: 'o-music',
      },
      {
        entry: { id: 'project-asset-1', mimeType: 'video/webm', createdAt: 1, size: 6 },
        filename: 'take.webm',
        objectId: 'o-video',
        videoReview: {
          workspace: {
            aggregateId: 'project-asset:project-asset-1',
            formatVersion: 1,
            source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
            revision: 3,
            cursor: 0,
            history: [],
            createdAt: 1,
            updatedAt: 2,
            advanced: {
              schemaVersion: 2,
              ui: { mode: 'advanced', tracks: { actions: true, zoom: false, audio: true } },
              zoom: { enabled: false, regions: [] },
              background: { enabled: false },
              audio: {
                original: { muted: false, volume: 1 },
                voiceover: [],
                music: [
                  {
                    id: 'm',
                    assetRef: musicAssetId,
                    timelineStart: 0,
                    sourceOffset: 0,
                    duration: 2,
                    volume: 1,
                    muted: false,
                    fadeIn: 0,
                    fadeOut: 0,
                  },
                ],
              },
            },
          },
          draft: null,
        },
      },
    ],
    projectExports: [
      {
        entry: {
          id: 'e',
          projectId: 'p',
          createdAt: 1,
          filename: 'result.webm',
          mimeType: 'video/webm',
          size: 6,
          duration: 2,
          width: 640,
          height: 360,
          fps: 30,
        },
        objectId: 'o-export',
        videoReview: {
          workspace: {
            aggregateId: 'export:e',
            formatVersion: 1,
            source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
            revision: 2,
            cursor: 0,
            history: [],
            createdAt: 1,
            updatedAt: 2,
            advanced: {
              schemaVersion: 2,
              ui: { mode: 'advanced', tracks: { actions: true, zoom: false, audio: true } },
              zoom: { enabled: false, regions: [] },
              background: { enabled: false },
              audio: {
                original: { muted: false, volume: 1 },
                voiceover: [],
                music: [
                  {
                    id: 'm',
                    assetRef: musicAssetId,
                    timelineStart: 0,
                    sourceOffset: 0,
                    duration: 2,
                    volume: 1,
                    muted: false,
                    fadeIn: 0,
                    fadeOut: 0,
                  },
                ],
              },
            },
          },
          draft: null,
        },
      },
    ],
  };
  assertPortableJson(metadata);
  const result = await videoProjectRootPublisher.publish({
    envelope: {
      descriptor: {
        rootKind: 'video-project',
        rootId: 'p',
        metadataPath: '_sniptale/metadata/projects/p.json',
        objectCount: 3,
        totalBytes: 20,
      },
      metadata,
      objects: [],
    },
    journal: {
      assetRefs: [],
      createdAt: 1,
      domain: 'archive-restore',
      journalId: 'j',
      payload: {},
    },
    session: {
      archiveFingerprint: 'a'.repeat(64),
      committedRoots: [],
      conflictedRoots: [],
      createdAt: 1,
      currentRoot: 'video-project:p',
      kind: 'archive-restore-session',
      operationId: 'restore',
      rootIdMap: {},
      skippedRoots: [],
      status: 'pending',
      strategy: 'duplicate',
      updatedAt: 1,
    },
    staged: [
      {
        objectId: 'o-music',
        ref: {
          assetId: 'new-music-local',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/new-music-local' },
          mimeType: 'audio/mpeg',
          sha256: null,
          size: 8,
        },
      },
      {
        objectId: 'o-video',
        ref: {
          assetId: 'new-video-local',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/new-video-local' },
          mimeType: 'video/webm',
          sha256: null,
          size: 6,
        },
      },
      {
        objectId: 'o-export',
        ref: {
          assetId: 'new-export-local',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/new-export-local' },
          mimeType: 'video/webm',
          sha256: null,
          size: 6,
        },
      },
    ],
  });
  expect(result.imported).toBe(true);
  const workspaces = values.get('video_workspaces') as Array<{
    aggregateId: string;
    advanced: { audio: { music: Array<{ assetId: string }> } };
  }>;
  expect(workspaces).toHaveLength(2);
  const restoredMusic = workspaces.map((ws) => ws.advanced.audio.music[0]!.assetId);
  for (const assetId of restoredMusic) {
    expect(assetId).toMatch(/^project-asset:.+/);
    expect(assetId).not.toBe(musicAssetId);
  }
  expect(restoredMusic[0]).toBe(restoredMusic[1]);
  const projects = values.get('video_projects') as Array<{
    project: {
      clips: Array<{ assetId?: string }>;
      assets: Array<{ id: string; source: { projectAssetId: string } }>;
    };
  }>;
  // The internal clip identity is stable; the store linkage is remapped.
  const baseClip = base.project.clips[0] as { assetId: string };
  expect(projects[0]!.project.clips[0]!.assetId).toBe(baseClip.assetId);
  expect(projects[0]!.project.clips[0]!.assetId).toBe(projects[0]!.project.assets[0]!.id);
  expect(projects[0]!.project.assets[0]!.source.projectAssetId).not.toBe('project-asset-1');
  expect(metadata.projectAssets.map((asset) => asset.entry.id).includes('project-asset-1')).toBe(
    true
  );
});
