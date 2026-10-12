import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEffectV1Document } from '@sniptale/runtime-contracts/effect-v1';
import { beforeEach, expect, it, vi } from 'vitest';
import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import type { VideoWorkspace, VideoWorkspaceSnapshot } from './contracts';
import type { ReviewOperation } from '../../../features/video/review/types';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import { inspectVideoWorkspace, parseVideoWorkspace } from './parser';
import { applyLocalReviewChange } from '../../../workflows/video-review/local-session';
import { workspaceStorageHead, workspaceStorageRows } from './storage-format';

const harness = vi.hoisted(() => ({ database: vi.fn(), failure: false }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: harness.database,
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: vi.fn(async () => []),
}));
vi.mock('../assets/operations', async (original) => ({
  ...(await original<typeof import('../assets/operations')>()),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));

import { completePhysicalDeleteOperation } from '../assets/operations';
import {
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  openVideoWorkspace,
  saveVideoWorkspaceSnapshot,
} from './store';

const id = 'recording:beta-v1-recording';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const operation: ReviewOperation = {
  id: 'branch',
  at: 1,
  target: 'annotation',
  before: null,
  after: { id: 'note', text: 'Branch after adopted resource', anchor: { kind: 'point', time: 2 } },
};
let rows: Map<string, Map<string, unknown>>;
beforeEach(() => {
  harness.failure = false;
  vi.mocked(completePhysicalDeleteOperation).mockClear();
  const fixture = createReviewWorkspaceStoreFixture(() => harness.failure);
  rows = fixture.rows;
  harness.database.mockResolvedValue(fixture.database);
});

async function installAdoptedAnnotation() {
  const opened = await openVideoWorkspace(id, source);
  const text = readFileSync(
    resolve(
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json'
    ),
    'utf8'
  );
  const result = validateEffectV1Document(JSON.parse(text));
  if (!result.ok || !result.document) throw new Error('Invalid adopted source fixture');
  const asset = result.document.assets[0]!;
  const hash = 'a'.repeat(64);
  const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
  const after = {
    ...before,
    annotationEffects: {
      enabled: false,
      instances: [
        {
          id: 'adopted',
          snapshotId: `effect:${hash}`,
          enabled: false,
          start: 1,
          end: 4,
          attachment: 'viewport',
          transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          controls: { accent: '#123456' },
          order: 0,
        },
      ],
    },
  };
  const workspace = parseVideoWorkspace({
    ...opened.workspace,
    cursor: 1,
    history: [{ id: 'apply-adopted', at: 1, target: 'advancedContent', before, after }],
    effectSnapshots: [
      {
        id: `effect:${hash}`,
        schemaVersion: 'sniptale.effect.v1',
        kind: 'standalone',
        documentId: result.document.id,
        sha256: hash,
        source: text,
        retainedByteLength: new TextEncoder().encode(text).byteLength + asset.byteLength!,
        assets: [
          {
            id: asset.id,
            kind: 'svg',
            mimeType: asset.mimeType,
            byteLength: asset.byteLength!,
            sha256: asset.sha256!,
            assetId: 'project-asset:adopted',
          },
        ],
      },
    ],
  });
  if (!workspace) throw new Error('Invalid adopted workspace fixture');
  rows.get('video_workspaces')!.set(id, workspaceStorageHead(workspace, []));
  for (const row of workspaceStorageRows(workspace))
    rows.get('video_workspace_history')!.set(JSON.stringify([id, row.ordinal]), row);
  rows.get('project_assets')!.set('adopted', {
    id: 'adopted',
    assetId: 'adopted-bytes',
    createdAt: 1,
    mimeType: asset.mimeType,
    size: asset.byteLength!,
  });
  rows.get('asset_refs')!.set('adopted-bytes', {
    assetId: 'adopted-bytes',
    createdAt: 1,
    mimeType: asset.mimeType,
    size: asset.byteLength!,
    sha256: asset.sha256!,
    location: { kind: 'opfs', objectKey: 'objects/adopted-bytes' },
  });
  rows.get('asset_owners')!.set(JSON.stringify(['project-asset', 'adopted', 'body']), {
    assetId: 'adopted-bytes',
    ownerKind: 'project-asset',
    ownerId: 'adopted',
    role: 'body',
  });
  return workspace;
}

it('releases adopted private annotation resources atomically when Undo is followed by branching', async () => {
  const adopted = await installAdoptedAnnotation();
  const undone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedRevision: adopted.revision,
    expectedSourceAssetId: adopted.sourceAssetId,
    direction: 'undo',
  });
  expect(undone.workspace.effectSnapshots).toHaveLength(1);
  expect(rows.get('project_assets')!.has('adopted')).toBe(true);
  expect(completePhysicalDeleteOperation).not.toHaveBeenCalled();
  const branch = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: undone.workspace.revision,
    expectedSourceAssetId: adopted.sourceAssetId,
    operation,
  });
  expect(branch.workspace.effectSnapshots).toEqual([]);
  expect(rows.get('project_assets')!.has('adopted')).toBe(false);
  expect(rows.get('asset_refs')!.has('adopted-bytes')).toBe(false);
  expect(rows.get('asset_owners')!.has(JSON.stringify(['project-asset', 'adopted', 'body']))).toBe(
    false
  );
  const intents = [...rows.get('asset_operations')!.values()];
  expect(intents).toHaveLength(1);
  expect(intents[0]).toMatchObject({ kind: 'physical-delete', assetIds: ['adopted-bytes'] });
  expect(completePhysicalDeleteOperation).toHaveBeenCalledWith(intents[0], undefined);
});

it.each(['redo-consumer', 'published', 'ambiguous'])(
  'keeps adopted resources with %s evidence after branching',
  async (kind) => {
    const adopted = await installAdoptedAnnotation();
    if (kind === 'redo-consumer') {
      const other = { ...adopted, aggregateId: 'other-review', cursor: 0 };
      rows.get('video_workspaces')!.set('other-review', other);
    } else if (kind === 'published') {
      rows.get('media_library')!.set('project-asset:adopted', { opaque: 'independent material' });
    } else rows.get('video_projects')!.set('corrupt', { id: 'corrupt' });
    const undone = await moveVideoWorkspaceHistory({
      aggregateId: id,
      expectedRevision: adopted.revision,
      expectedSourceAssetId: adopted.sourceAssetId,
      direction: 'undo',
    });
    await commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: undone.workspace.revision,
      expectedSourceAssetId: adopted.sourceAssetId,
      operation,
    });
    expect(rows.get('project_assets')!.has('adopted')).toBe(true);
    expect(rows.get('asset_refs')!.has('adopted-bytes')).toBe(true);
    expect(rows.get('asset_owners')!.size).toBe(1);
    expect(completePhysicalDeleteOperation).not.toHaveBeenCalled();
  }
);

it('preserves the prior graph and adopted ownership when delete-intent publication fails', async () => {
  const fixture = createReviewWorkspaceStoreFixture((name) => name === 'asset_operations');
  rows = fixture.rows;
  harness.database.mockResolvedValue(fixture.database);
  const adopted = await installAdoptedAnnotation();
  const undone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedRevision: adopted.revision,
    expectedSourceAssetId: adopted.sourceAssetId,
    direction: 'undo',
  });
  const before = structuredClone(rows);
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: undone.workspace.revision,
      expectedSourceAssetId: adopted.sourceAssetId,
      operation,
    })
  ).rejects.toThrow('No space');
  expect(rows).toEqual(before);
  expect(completePhysicalDeleteOperation).not.toHaveBeenCalled();
});

it('journals private annotation release when the paused buffer replaces all retained history', async () => {
  const adopted = await installAdoptedAnnotation();
  const saved = await saveVideoWorkspaceSnapshot({
    aggregateId: id,
    expectedRevision: adopted.revision,
    expectedSourceAssetId: adopted.sourceAssetId,
    expectedDraftRevision: null,
    workspace: { ...adopted, history: [], cursor: 0, effectSnapshots: [] },
    draft: null,
  });
  expect(saved.workspace.effectSnapshots).toEqual([]);
  expect(rows.get('project_assets')!.has('adopted')).toBe(false);
  expect(completePhysicalDeleteOperation).toHaveBeenCalledOnce();
});

it('keeps committed authored changes and a replay intent when physical deletion fails', async () => {
  const adopted = await installAdoptedAnnotation();
  const undone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedRevision: adopted.revision,
    expectedSourceAssetId: adopted.sourceAssetId,
    direction: 'undo',
  });
  vi.mocked(completePhysicalDeleteOperation).mockRejectedValueOnce(
    new Error('Physical deletion unavailable')
  );
  const saved = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: undone.workspace.revision,
    expectedSourceAssetId: adopted.sourceAssetId,
    operation,
  });
  expect(saved.workspace.history).toEqual([operation]);
  expect(rows.get('project_assets')!.has('adopted')).toBe(false);
  expect([...rows.get('asset_operations')!.values()]).toEqual([
    expect.objectContaining({ kind: 'physical-delete', assetIds: ['adopted-bytes'] }),
  ]);
});

it.each(['append', 'paused-save'])(
  'retains expired effect bytes after automatic history rollover via %s',
  async (mode) => {
    const adopted = await installAdoptedAnnotation();
    const applied = adopted.history[0]!;
    if (applied.target !== 'advancedContent') throw new Error('Unexpected adopted operation');
    const history: ReviewOperation[] = [
      applied,
      { ...applied, id: 'remove-adopted', before: applied.after, after: applied.before },
    ];
    let volume = applied.before.audio.original.volume;
    for (let i = 0; i < 48; i++) {
      const after = i % 2 ? 0.2 : 0.3;
      history.push({
        id: `retained-gain-${i}`,
        at: i + 2,
        target: 'sourceAudio',
        before: { muted: false, volume },
        after: { muted: false, volume: after },
      });
      volume = after;
    }
    const parsed = parseVideoWorkspace({ ...adopted, history, cursor: history.length });
    if (!parsed) throw new Error('Invalid rollover fixture');
    let workspace: VideoWorkspace = parsed;
    rows.get('video_workspaces')!.set(id, workspaceStorageHead(workspace, []));
    rows.get('video_workspace_history')!.clear();
    for (const row of workspaceStorageRows(workspace))
      rows.get('video_workspace_history')!.set(JSON.stringify([id, row.ordinal]), row);
    for (let i = 0; i < 3; i++) {
      const current = inspectVideoWorkspace(workspace).document!;
      const change: ReviewOperation = {
        id: `rollover-gain-${i}`,
        at: 100 + i,
        target: 'sourceAudio',
        before: { ...current.advancedContent.audio.original },
        after: { muted: false, volume: i % 2 ? 0.5 : 0.6 },
      };
      const saved: VideoWorkspaceSnapshot =
        mode === 'append'
          ? await commitVideoWorkspace({
              aggregateId: id,
              expectedRevision: workspace.revision,
              expectedSourceAssetId: workspace.sourceAssetId,
              operation: change,
            })
          : await saveVideoWorkspaceSnapshot({
              aggregateId: id,
              expectedRevision: workspace.revision,
              expectedSourceAssetId: workspace.sourceAssetId,
              expectedDraftRevision: null,
              ...applyLocalReviewChange(
                { workspace, draft: null },
                { kind: 'commit', operation: change, consumeDraft: false }
              ),
            });
      workspace = saved.workspace;
    }
    expect(workspace.history).toHaveLength(50);
    expect(workspace.effectSnapshots).toEqual([]);
    expect(rows.get('project_assets')!.has('adopted')).toBe(true);
    expect(rows.get('asset_refs')!.has('adopted-bytes')).toBe(true);
    expect(
      rows.get('asset_owners')!.has(JSON.stringify(['project-asset', 'adopted', 'body']))
    ).toBe(true);
    expect(completePhysicalDeleteOperation).not.toHaveBeenCalled();
  }
);
