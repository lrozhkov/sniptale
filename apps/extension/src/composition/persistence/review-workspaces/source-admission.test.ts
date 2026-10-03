import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetReadyJournal } from '../assets/contracts';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import { createVideoReviewSession } from '../../../workflows/video-review/session';
import { updateQuickEditBackground } from '../../../features/video/review/advanced/background';

const harness = vi.hoisted(() => ({ database: vi.fn(), journals: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: harness.database,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: harness.journals,
}));
import { openVideoWorkspace, readVideoWorkspace, saveVideoWorkspaceAdvanced } from './store';

const id = 'recording:beta-v1-recording';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const entry = {
  id: 'background',
  assetId: 'background-bytes',
  createdAt: 1,
  mimeType: 'image/png',
  size: 5,
};
let rows: Map<string, Map<string, unknown>>;
let journals: AssetReadyJournal[];
beforeEach(() => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  rows = fixture.rows;
  harness.database.mockResolvedValue(fixture.database);
  journals = [];
  harness.journals.mockImplementation(async () => journals);
});

it('refuses a buffered initial background reference after its published source was purged', async () => {
  const opened = await openVideoWorkspace(id, source);
  const session = createVideoReviewSession(opened);
  session.setAutosaveEnabled(false);
  rows.get('project_assets')!.set(entry.id, entry);
  const before = session.getSnapshot().document.advancedContent;
  await session.commit({
    id: 'background-import',
    at: 1,
    target: 'advancedContent',
    before,
    after: {
      ...before,
      background: updateQuickEditBackground(before.background, {
        enabled: true,
        type: 'image',
        assetId: 'project-asset:background',
      }),
    },
  });
  expect((await readVideoWorkspace(id))?.workspace.history).toEqual([]);
  rows.get('project_assets')!.delete(entry.id);
  session.setAutosaveEnabled(true);
  await expect(session.flush()).rejects.toThrow();
  expect(await readVideoWorkspace(id)).toEqual(opened);
  expect(session.getSnapshot().dirty).toBe(true);
});

it('refuses new missing auxiliary references in advanced recovery data', async () => {
  const opened = await openVideoWorkspace(id, source);
  await expect(
    saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      advanced: {
        ...opened.workspace.advanced,
        recoveryV1: JSON.stringify({
          background: {
            type: 'image',
            assetId: 'project-asset:missing',
          },
        }),
      },
    })
  ).rejects.toMatchObject({ code: 'missing-media' });
  expect(await readVideoWorkspace(id)).toEqual(opened);
});

function readyJournal(overrides: Partial<AssetReadyJournal> = {}): AssetReadyJournal {
  return {
    journalId: 'ready-background',
    createdAt: 1,
    domain: 'project-assets',
    assetRefs: [
      {
        assetId: entry.assetId,
        createdAt: 1,
        mimeType: entry.mimeType,
        size: entry.size,
        sha256: null,
        location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
      },
    ],
    payload: { entry, filename: 'background.png', expectedAssetId: null },
    ...overrides,
  };
}

async function saveBackground() {
  const opened = await openVideoWorkspace(id, source);
  return saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    advanced: {
      ...opened.workspace.advanced,
      background: updateQuickEditBackground(opened.workspace.advanced.background, {
        enabled: true,
        type: 'image',
        assetId: 'project-asset:background',
      }),
    },
  });
}

it('admits new sources through durable rows and preserves unchanged missing legacy references', async () => {
  rows.get('project_assets')!.set(entry.id, entry);
  const saved = await saveBackground();
  rows.get('project_assets')!.delete(entry.id);
  await expect(
    saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: saved.workspace.revision,
      expectedSourceAssetId: saved.workspace.sourceAssetId,
      advanced: saved.workspace.advanced,
    })
  ).resolves.toBeDefined();
});

it('admits a prepared source before publication from its matching standalone ready journal', async () => {
  journals.push(readyJournal());
  const saved = await saveBackground();
  expect(saved.workspace.advanced.background).toMatchObject({
    assetId: 'project-asset:background',
  });
  expect(rows.get('project_assets')!.size).toBe(0);
});

it.each([
  'unrelated-domain',
  'archive',
  'replacement',
  'wrong-object',
  'wrong-review',
  'invalid-payload',
])('refuses %s ready evidence', async (kind) => {
  const journal = readyJournal();
  if (kind === 'unrelated-domain') journal.domain = 'scenario-assets';
  if (kind === 'archive') journal.operationId = 'archive';
  if (kind === 'replacement')
    journal.payload = { entry, filename: 'image', expectedAssetId: 'old' };
  if (kind === 'wrong-object')
    journal.assetRefs[0] = { ...journal.assetRefs[0]!, assetId: 'other' };
  if (kind === 'wrong-review')
    journal.payload = {
      entry,
      filename: 'image',
      expectedAssetId: null,
      requiredReview: { aggregateId: 'other', clipId: 'clip' },
    };
  if (kind === 'invalid-payload') journal.payload = { entry };
  journals.push(journal);
  await expect(saveBackground()).rejects.toMatchObject({ code: 'missing-media' });
  expect((await readVideoWorkspace(id))?.workspace.advanced.background.enabled).toBe(false);
});

it('admits voiceover attach before publication with a ready claim scoped to this review', async () => {
  const { commitVideoWorkspace } = await import('./store');
  const { createQuickEditAudioClip } =
    await import('../../../features/video/review/advanced/audio');
  const { createQuickEditAdvancedContent } =
    await import('../../../features/video/review/advanced/defaults');
  const audioEntry = { ...entry, mimeType: 'audio/webm' };
  const journal = readyJournal();
  journal.assetRefs[0] = { ...journal.assetRefs[0]!, mimeType: audioEntry.mimeType };
  journal.payload = {
    entry: audioEntry,
    filename: 'voice.webm',
    expectedAssetId: null,
    requiredReview: { aggregateId: id, clipId: 'voiceover' },
  };
  journals.push(journal);
  const opened = await openVideoWorkspace(id, source);
  const before = createQuickEditAdvancedContent();
  const clip = createQuickEditAudioClip({
    id: 'voiceover',
    assetId: 'project-asset:background',
    timelineStart: 0,
    duration: 2,
    endMax: 12,
  });
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      operation: {
        id: 'voiceover-import',
        at: 1,
        target: 'advancedContent',
        before,
        after: { ...before, audio: { ...before.audio, voiceover: [clip] } },
      },
    })
  ).resolves.toBeDefined();
  expect(rows.get('project_assets')!.size).toBe(0);
});

it('holds ready authority until the consuming transaction commits', async () => {
  const { runWithDurableAssetLifecycleLock } = await import('../infrastructure/mutation-barrier');
  journals.push(readyJournal());
  let cancellation: Promise<void> | undefined;
  harness.journals.mockImplementationOnce(async () => {
    cancellation = runWithDurableAssetLifecycleLock(async () => {
      expect((await readVideoWorkspace(id))?.workspace.advanced.background).toMatchObject({
        assetId: 'project-asset:background',
      });
      journals = [];
    });
    return journals;
  });
  await saveBackground();
  await cancellation;
});

it('rejects a disappeared private origin and malformed source without changing the workspace', async () => {
  for (const row of [
    { ...entry, originMediaId: 'purged' },
    { ...entry, assetId: null },
  ]) {
    rows.get('project_assets')!.set(entry.id, row);
    await expect(saveBackground()).rejects.toMatchObject({ code: 'missing-media' });
    expect((await readVideoWorkspace(id))?.workspace.advanced.background.enabled).toBe(false);
  }
});
