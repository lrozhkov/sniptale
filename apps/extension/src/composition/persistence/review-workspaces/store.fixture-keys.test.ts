import { expect, it } from 'vitest';
import { createReviewWorkspaceStoreFixture } from './store.test-support';

const cases: Array<{ name: string; row: Record<string, unknown>; key: IDBValidKey }> = [
  { name: 'editor_vector_library', row: { key: 'settings', id: 'wrong' }, key: 'settings' },
  { name: 'sync_capture', row: { key: 'profile', id: 'wrong' }, key: 'profile' },
  { name: 'sync_outbox', row: { key: 'outgoing', id: 'wrong' }, key: 'outgoing' },
  { name: 'sync_connection', row: { key: 'connection', id: 'wrong' }, key: 'connection' },
  { name: 'video_project_revisions', row: { projectId: 'project', id: 'wrong' }, key: 'project' },
  {
    name: 'recording_events',
    row: { recordingId: 'rec', eventStreamId: 'stream', kind: 'typing', entryId: 'entry' },
    key: ['rec', 'stream', 'typing', 'entry'],
  },
  {
    name: 'scenario_project_history',
    row: { projectId: 'project', revision: 2 },
    key: ['project', 2],
  },
  {
    name: 'scenario_project_units',
    row: { projectId: 'project', unitId: 'unit', revision: 3 },
    key: ['project', 'unit', 3],
  },
  { name: 'video_workspace_history', row: { aggregateId: 'video', ordinal: 4 }, key: ['video', 4] },
  { name: 'recording_telemetry', row: { recordingId: 'rec', id: 'wrong' }, key: 'rec' },
  {
    name: 'asset_owners',
    row: {
      ownerKind: 'editor-vector-definition',
      ownerId: 'definition',
      role: 'body',
      assetId: 'asset',
    },
    key: ['editor-vector-definition', 'definition', 'body'],
  },
  { name: 'image_workspaces', row: { aggregateId: 'image', id: 'wrong' }, key: 'image' },
  { name: 'media_library', row: { id: 'image' }, key: 'image' },
  { name: 'asset_refs', row: { assetId: 'asset' }, key: 'asset' },
];

it.each(cases)('keeps native fixture identity for $name', async ({ name, row, key }) => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const tx = fixture.database.transaction([name], 'readwrite');
  const store = tx.objectStore(name);
  await store.put(row);
  expect(await store.get(key)).toEqual(row);
  await expect(store.add(row)).rejects.toMatchObject({ name: 'ConstraintError' });
  await tx.done;
  const read = fixture.database.transaction([name], 'readonly');
  expect(await read.objectStore(name).get(key)).toEqual(row);
  await read.done;
});

it('keeps invalid fixture identities out of committed rows', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const before = structuredClone(fixture.rows.get('editor_vector_library'));
  const tx = fixture.database.transaction(['editor_vector_library'], 'readwrite');
  await expect(
    tx.objectStore('editor_vector_library').put({ key: 2, id: 'wrong' })
  ).rejects.toThrow('Missing test row identity');
  tx.abort();
  await expect(tx.done).rejects.toMatchObject({ name: 'AbortError' });
  expect(fixture.rows.get('editor_vector_library')).toEqual(before);
});
