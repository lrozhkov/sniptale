import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntry } from '../../../../composition/persistence/projects/index.test-support';
import { assertPortableJson } from '../codec';

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
