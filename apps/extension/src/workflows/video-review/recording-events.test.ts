import '../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../features/video/project/recording-events/fixtures.json';
import { createRecordingEventsBlockPacker } from '../../features/video/project/recording-events/blocks';
import { isRecordingEventsDescriptor } from '../../features/video/project/recording-events/records';
import { recordingEventProjectSignals } from '../../features/video/project/recording-events/project-facts';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../features/video/project/mutation';
import { installPersistenceLockManagerForTests } from '../../composition/persistence/infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import { DB_VERSION } from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { createRecordingEventsStore } from '../../composition/persistence/recordings/recording-events/store';
import * as readerOwner from '../../composition/persistence/recordings/recording-events/reader';
import { createRecordingEventsRenderer } from './recording-events';

let sequence = 0;
const databases: { name: string; db: IDBPDatabase }[] = [];
beforeEach(() =>
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  })
);
afterEach(async () => {
  vi.restoreAllMocks();
  installPersistenceLockManagerForTests(null);
  for (const { name, db } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});
async function setup(sparse: number, dense: number) {
  const name = `render-recording-events-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ name, db });
  const dependencies = { database: async () => db, mintGeneration: () => crypto.randomUUID() };
  const store = createRecordingEventsStore(dependencies);
  const identity = { recordingId: fixture.recordingId, eventStreamId: fixture.eventStreamId };
  const writer = await store.begin(identity);
  const packer = createRecordingEventsBlockPacker(identity.recordingId, identity.eventStreamId);
  const blocks = packer.append(fixture.blocks[0]!.value.records[0]);
  const add = (index: number, time: number, id: string) =>
    blocks.push(
      ...packer.append({
        kind: 'signal',
        recordSeq: index + 1,
        segmentId: 0,
        activeTimeUs: time,
        signal: {
          id,
          kind: 'cursor-idle',
          startTimeUs: time,
          endTimeUs: time,
          point: null,
          data: { source: 'browser-cursor' },
        },
      })
    );
  for (let i = 0; i < sparse; i++) add(i, i * 1_000_000, `sparse-${i}`);
  const denseTime = Math.max(1, sparse - 1) * 1_000_000;
  for (let i = 0; i < dense; i++) add(sparse + i, denseTime, `dense-${i}`);
  blocks.push(
    ...packer.append({
      kind: 'boundary',
      recordSeq: sparse + dense + 1,
      segmentId: 0,
      activeTimeUs: denseTime + 1_000_000,
      reason: 'stop',
    }),
    ...packer.finish()
  );
  for (const block of blocks) await store.append(writer, block);
  const raw = { ...fixture.descriptor, state: 'complete', ...packer.summary() };
  if (!isRecordingEventsDescriptor(raw)) throw new Error('Invalid test descriptor.');
  const descriptor = raw;
  await store.finalize(writer, descriptor);
  const base = createVideoProjectFromRecording({
    recordingId: identity.recordingId,
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: denseTime / 1_000_000 + 1,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    sourceNormalizedActionEvents: [],
    recordingSignals: [],
  });
  const project = applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({ ...group, events: descriptor })),
  });
  return { db, store, identity, writer, descriptor, project, dependencies, blocks, denseTime };
}

it('reads history past 4096 and exhausts every dense-window page without expanding saved JSON', async () => {
  const { store, identity, writer, project, dependencies } = await setup(4501, 500);
  const renderer = createRecordingEventsRenderer(dependencies);
  const before = JSON.stringify(project);
  const rendered = await renderer.prepare(project, { start: 4500, end: 4501 });
  const signals = recordingEventProjectSignals(rendered, project.actionFeedback![0]!);
  expect(signals.some((signal) => signal.id === 'sparse-4500')).toBe(true);
  expect(signals.filter((signal) => signal.id.startsWith('dense-'))).toHaveLength(500);
  expect(new Set(signals.map((signal) => signal.id)).size).toBe(signals.length);
  expect(JSON.stringify(rendered)).toBe(before);
  expect(project.actionFeedback?.[0]?.signals).toEqual([]);
  await store.retire(identity, writer.writerGeneration);
  await expect(renderer.prepare(project, { start: 4500, end: 4501 })).rejects.toThrow(
    'source is unavailable'
  );
  renderer.clear();
}, 60000);

it('rejects a source recreated between pages and permits a fresh complete retry', async () => {
  const { store, identity, writer, descriptor, project, dependencies, blocks } = await setup(
    2,
    300
  );
  const reader = readerOwner.createRecordingEventsReader(dependencies);
  const admitted = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  let first = true;
  vi.spyOn(readerOwner, 'createRecordingEventsReader').mockReturnValue({
    async readPage(args) {
      const page = await reader.readPage(args);
      if (first) {
        first = false;
        admitted.resolve();
        await resume.promise;
      }
      return page;
    },
  });
  const renderer = createRecordingEventsRenderer(dependencies);
  const pending = renderer.prepare(project, { start: 1, end: 2 });
  const rejected = expect(pending).rejects.toThrow();
  await admitted.promise;
  await expect(renderer.prepare(project, { start: 1, end: 2 })).rejects.toThrow('already active');
  await store.retire(identity, writer.writerGeneration);
  const successor = await store.restore(identity);
  for (const block of blocks) await store.append(successor, block);
  await store.finalize(successor, descriptor);
  resume.resolve();
  await rejected;
  const rendered = await renderer.prepare(project, { start: 1, end: 2 });
  expect(
    recordingEventProjectSignals(rendered, project.actionFeedback![0]!).filter((signal) =>
      signal.id.startsWith('dense-')
    )
  ).toHaveLength(300);
  renderer.clear();
});
