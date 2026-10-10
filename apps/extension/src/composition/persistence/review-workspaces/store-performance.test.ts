import { beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import {
  createReviewAdvancedContentOperation,
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import type { ReviewOperation } from '../../../features/video/review/types';
import { withReviewWorkspaceUsage } from '../media-library/usage-index-keys';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import type { VideoWorkspace } from './contracts';

const observed = vi.hoisted(() => ({
  database: vi.fn(),
  parse: vi.fn(),
  inspect: vi.fn(),
  replay: vi.fn(),
  reads: 0,
  writes: 0,
}));
vi.mock('../../../features/video/review/document', async (load) => {
  const actual = await load<typeof import('../../../features/video/review/document')>();
  observed.replay.mockImplementation(actual.replayReviewHistory);
  return { ...actual, replayReviewHistory: observed.replay };
});
vi.mock('./parser', async (load) => {
  const actual = await load<typeof import('./parser')>();
  observed.parse.mockImplementation(actual.parseVideoWorkspace);
  observed.inspect.mockImplementation(actual.inspectVideoWorkspace);
  return {
    ...actual,
    parseVideoWorkspace: observed.parse,
    inspectVideoWorkspace: observed.inspect,
  };
});
vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: observed.database,
  MEDIA_LIBRARY_STORE: 'media_library',
  VIDEO_WORKSPACES_STORE: 'video_workspaces',
  VIDEO_WORKSPACE_DRAFTS_STORE: 'video_workspace_drafts',
}));
vi.mock('../assets/opfs-store', async (load) => ({
  ...(await load<typeof import('../assets/opfs-store')>()),
  listReadyJournals: vi.fn(async () => []),
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await observed.database()),
}));

import {
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  openVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
  saveVideoWorkspaceSnapshot,
} from './store';

const id = 'recording:beta-v1-recording';
const assetId = 'beta-v1-recording-asset';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
let rows: Map<string, Map<string, unknown>>;

beforeEach(() => {
  observed.parse.mockClear();
  observed.inspect.mockClear();
  observed.replay.mockClear();
  observed.reads = observed.writes = 0;
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  rows = fixture.rows;
  observed.database.mockResolvedValue({
    transaction(stores: string[], mode: string) {
      const tx = fixture.database.transaction(stores, mode);
      return {
        abort: () => tx.abort(),
        get done() {
          return tx.done;
        },
        objectStore(name: string) {
          const store = tx.objectStore(name);
          return {
            ...store,
            get(key: string) {
              if (name === 'video_workspaces') observed.reads++;
              return store.get(key);
            },
            put(value: Parameters<typeof store.put>[0]) {
              if (name === 'video_workspaces') observed.writes++;
              return store.put(value);
            },
          };
        },
      };
    },
  });
});

function workspace(historyLength: number, fragments = 10): VideoWorkspace {
  const advanced = createQuickEditAdvancedState();
  const content = {
    ...reviewAdvancedContentBaseline(advanced),
    text: {
      version: 1 as const,
      fragments: Array.from({ length: fragments }, (_, index) => ({
        id: `fragment-${index}`,
        start: (index * source.duration) / fragments,
        end: ((index + 1) * source.duration) / fragments,
        text: 'Synthetic text for the autosave admission regression.',
        originalText: '',
        revision: 0,
        timingRevision: 0,
        timeDomain: 'result' as const,
        alignment: 'manual' as const,
        showInVideo: false,
      })),
    },
  };
  const history: ReviewOperation[] = [];
  let before = reviewAdvancedContentBaseline(advanced);
  for (let index = 0; index < historyLength; index++) {
    const after = {
      ...content,
      audio: { ...content.audio, original: { volume: 1, muted: index % 2 === 1 } },
    };
    history.push({
      id: `operation-${index}`,
      at: index + 1,
      target: 'advancedContent',
      before,
      after,
    });
    before = after;
  }
  return {
    aggregateId: id,
    formatVersion: 1,
    source,
    sourceAssetId: assetId,
    revision: 1,
    history,
    cursor: history.length,
    advanced,
    createdAt: 1,
    updatedAt: 1,
  };
}

function identity(value: VideoWorkspace) {
  return { aggregateId: id, expectedSourceAssetId: assetId, expectedRevision: value.revision };
}

function parameterEdit(value: VideoWorkspace): ReviewOperation {
  const before = replayReviewHistory(
    value.history,
    value.cursor,
    value.source,
    reviewAdvancedContentBaseline(value.advanced)
  ).advancedContent;
  const operation = createReviewAdvancedContentOperation({
    id: 'parameter-edit',
    at: 1000,
    before,
    after: {
      ...before,
      audio: {
        ...before.audio,
        original: { ...before.audio.original, muted: !before.audio.original.muted },
      },
    },
  });
  if (!operation) throw new Error('Missing parameter fixture change');
  return operation;
}

it.each([
  { historyLength: 2, fragments: 10 },
  { historyLength: 80, fragments: 200 },
])('admits previous and candidate once for $historyLength retained operations', async (size) => {
  const previous = workspace(size.historyLength, size.fragments);
  rows.get('video_workspaces')!.set(id, previous);
  const operation = parameterEdit(previous);
  observed.replay.mockClear();
  const result = await commitVideoWorkspace({
    ...identity(previous),
    operation,
  });
  expect(observed.parse.mock.calls.length + observed.inspect.mock.calls.length).toBe(2);
  expect(observed.reads).toBe(1);
  expect(observed.writes).toBe(1);
  expect(operation.target).toBe('sourceAudio');
  expect(observed.replay.mock.calls.filter(([history]) => history.length > 0)).toHaveLength(0);
  expect(observed.replay).toHaveBeenCalledTimes(2);
  expect(result.workspace.history.slice(0, previous.cursor)).toEqual(previous.history);
  expect(result.workspace.cursor).toBe(previous.cursor + 1);
  expect(result.workspace.revision).toBe(2);
  expect(Object.keys(result).sort()).toEqual(['draft', 'workspace']);
  const persisted = await readVideoWorkspace(id);
  if (!persisted) throw new Error('Missing persisted workspace');
  expect(persisted.workspace.history.at(-1)).toEqual(operation);
  expect(
    new TextEncoder().encode(JSON.stringify(persisted.workspace.history.at(-1))).byteLength
  ).toBeLessThan(300);
});

it('still rejects corrupt unapplied redo before any write', async () => {
  const previous = workspace(2);
  rows.get('video_workspaces')!.set(id, {
    ...previous,
    cursor: 0,
    history: [...previous.history, { ...previous.history[0], id: 'invalid-redo' }],
  });
  const before = structuredClone(rows);
  await expect(
    commitVideoWorkspace({ ...identity(previous), operation: parameterEdit(previous) })
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(rows).toEqual(before);
  expect(observed.writes).toBe(0);
});

it('still rejects an invalid candidate without publishing a partial revision', async () => {
  const previous = workspace(2);
  rows.get('video_workspaces')!.set(id, previous);
  const before = structuredClone(rows);
  await expect(
    commitVideoWorkspace({
      ...identity(previous),
      operation: { ...parameterEdit(previous), id: previous.history[0]!.id },
    })
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(rows).toEqual(before);
  expect(observed.writes).toBe(0);
});

it('derives retained usage keys for every workspace writer without accepting imported keys', async () => {
  const previous = workspace(0);
  const webcam = (name: string) => ({
    ...createQuickEditWebcam(`project-asset:${name}`, source, source),
    enabled: false,
  });
  previous.advanced.webcam = webcam('current');
  previous.advanced.recoveryV1 = JSON.stringify({ webcam: webcam('recovery') });
  previous.history = [
    {
      id: 'retained-redo',
      at: 1,
      target: 'advancedContent',
      before: reviewAdvancedContentBaseline(previous.advanced),
      after: { ...reviewAdvancedContentBaseline(previous.advanced), webcam: webcam('redo') },
    },
  ];
  rows.get('video_workspaces')!.set(id, { ...previous, usageReferenceKeys: ['forged'] });
  const moved = await moveVideoWorkspaceHistory({ ...identity(previous), direction: 'redo' });
  expect(rows.get('video_workspaces')!.get(id)).toEqual(withReviewWorkspaceUsage(moved.workspace));
  const advanced = await saveVideoWorkspaceAdvanced({
    ...identity(moved.workspace),
    advanced: moved.workspace.advanced,
  });
  expect(rows.get('video_workspaces')!.get(id)).toEqual(
    withReviewWorkspaceUsage(advanced.workspace)
  );
  const saved = await saveVideoWorkspaceSnapshot({
    ...identity(advanced.workspace),
    expectedDraftRevision: null,
    workspace: { ...advanced.workspace, usageReferenceKeys: ['forged'] },
    draft: null,
  });
  expect(rows.get('video_workspaces')!.get(id)).toEqual(withReviewWorkspaceUsage(saved.workspace));
  const draft = await saveVideoWorkspaceDraft({
    ...identity(saved.workspace),
    expectedDraftRevision: null,
    annotation: { id: 'recovery-field', text: 'Recovery', anchor: { kind: 'point', time: 1 } },
    before: null,
  });
  const discarded = await saveVideoWorkspaceDraft({
    ...identity(draft.workspace),
    expectedDraftRevision: draft.draft!.revision,
    annotation: null,
    before: null,
  });
  expect(rows.get('video_workspaces')!.get(id)).toEqual(
    withReviewWorkspaceUsage(discarded.workspace)
  );
  rows.get('video_workspaces')!.delete(id);
  const opened = await openVideoWorkspace(id, source);
  expect(rows.get('video_workspaces')!.get(id)).toEqual(withReviewWorkspaceUsage(opened.workspace));
  const reopened = await openVideoWorkspace(id, source);
  const unchanged = await moveVideoWorkspaceHistory({
    ...identity(opened.workspace),
    direction: 'undo',
  });
  const writesBeforeRead = observed.writes;
  const read = await readVideoWorkspace(id);
  expect(observed.writes).toBe(writesBeforeRead);
  for (const result of [
    moved,
    advanced,
    saved,
    draft,
    discarded,
    opened,
    reopened,
    unchanged,
    read,
  ])
    expect(Object.keys(result ?? {}).sort()).toEqual(['draft', 'workspace']);
});
