import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import { listVideoWorkspaceSummaries } from './summaries';

const mocks = vi.hoisted(() => ({ initDB: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
const id = 'recording:beta-v1-recording';
const head = {
  aggregateId: id,
  formatVersion: 4,
  revision: 2,
  cursor: 0,
  historyLength: 0,
  sourceAssetId: 'beta-v1-recording-asset',
  source: { duration: 2, width: 640, height: 360, size: 4, mimeType: 'video/webm' },
  createdAt: 1,
  updatedAt: 2,
  project: { name: 'Saved edit', lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2 } },
};
let fixture: ReturnType<typeof createReviewWorkspaceStoreFixture>;
beforeEach(() => {
  fixture = createReviewWorkspaceStoreFixture(() => false);
  fixture.rows.get('video_workspaces')!.set(id, head);
  const recording = fixture.rows.get('recordings')!.get('beta-v1-recording');
  if (!recording || typeof recording !== 'object') throw new Error('Missing recording fixture');
  fixture.rows
    .get('recordings')!
    .set('beta-v1-recording', { ...recording, assetId: head.sourceAssetId });
  mocks.initDB.mockResolvedValue({
    transaction: (stores: string[], mode: string) => {
      expect(mode).toBe('readonly');
      expect(stores).not.toContain('video_workspace_history');
      expect(stores).not.toContain('asset_refs');
      return fixture.database.transaction(stores, mode);
    },
  });
});
it('lists one saved project from metadata without reading history or mutating storage', async () => {
  const before = structuredClone(fixture.rows);
  expect(await listVideoWorkspaceSummaries()).toEqual([
    expect.objectContaining({
      aggregateId: id,
      name: 'Saved edit',
      unavailableReason: null,
      revision: 2,
    }),
  ]);
  expect(fixture.rows).toEqual(before);
});
it('projects legacy metadata without writing it and does not invent a preview project', async () => {
  const { project: _project, ...legacy } = head;
  fixture.rows.get('video_workspaces')!.set(id, { ...legacy, formatVersion: 2 });
  const before = structuredClone(fixture.rows);
  expect(await listVideoWorkspaceSummaries()).toEqual([
    expect.objectContaining({
      aggregateId: id,
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2 },
    }),
  ]);
  expect(fixture.rows).toEqual(before);
  fixture.rows.get('video_workspaces')!.clear();
  expect(await listVideoWorkspaceSummaries()).toEqual([]);
});
it.each(['missing', 'changed', 'invalid'] as const)(
  'keeps an unavailable card for a %s source',
  async (reason) => {
    if (reason === 'missing') fixture.rows.get('recordings')!.clear();
    if (reason === 'changed')
      fixture.rows.get('video_workspaces')!.set(id, { ...head, sourceAssetId: 'different' });
    if (reason === 'invalid')
      fixture.rows.get('video_workspaces')!.set(id, { ...head, source: {} });
    expect(await listVideoWorkspaceSummaries()).toEqual([
      expect.objectContaining({ aggregateId: id, unavailableReason: expect.any(String) }),
    ]);
  }
);

it.each([
  { formatVersion: 2 },
  { formatVersion: 3, historyStart: 0 },
  { formatVersion: 5 },
  { formatVersion: 5, historyStart: -1 },
  { formatVersion: 5, historyStart: Number.MAX_SAFE_INTEGER, historyLength: 1 },
  { history: [] },
  { advanced: {} },
  { baseline: {} },
  { effectSnapshots: [] },
  { ui: {} },
  { updatedAt: 0 },
  { sourceAssetId: 'x'.repeat(257) },
])('keeps invalid physical envelope unavailable: %j', async (patch) => {
  fixture.rows.get('video_workspaces')!.set(id, { ...head, ...patch });
  const before = structuredClone(fixture.rows);
  expect(await listVideoWorkspaceSummaries()).toEqual([
    expect.objectContaining({ aggregateId: id, unavailableReason: 'invalid-workspace' }),
  ]);
  expect(fixture.rows).toEqual(before);
});
it.each([1, 2])('rejects project metadata in logical legacy format %i', async (formatVersion) => {
  const { historyLength: _length, ...logical } = head;
  fixture.rows.get('video_workspaces')!.set(id, { ...logical, formatVersion, history: [] });
  expect(await listVideoWorkspaceSummaries()).toEqual([
    expect.objectContaining({ unavailableReason: 'invalid-workspace' }),
  ]);
});
it('rejects physical history offsets in a logical envelope', async () => {
  const { historyLength: _length, ...logical } = head;
  fixture.rows.get('video_workspaces')!.set(id, { ...logical, history: [], historyStart: 0 });
  expect(await listVideoWorkspaceSummaries()).toEqual([
    expect.objectContaining({ unavailableReason: 'invalid-workspace' }),
  ]);
});
