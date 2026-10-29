import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import type { AssetReadyJournal } from '../assets/contracts';
import { publishRecordingAssetJournal } from './asset-publication';
import { parseRecordingEntry } from './index.guards';
import { saveRecordingTelemetry, deleteRecordingTelemetry } from './telemetry';

const io = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: io.mutation,
}));
beforeEach(() => vi.clearAllMocks());

const recording = {
  id: 'saved-recording',
  assetId: 'recording-bytes',
  filename: 'saved.webm',
  mimeType: 'video/webm',
  createdAt: 2,
  size: 6,
};
const ref = {
  assetId: recording.assetId,
  createdAt: 2,
  location: { kind: 'opfs' as const, objectKey: 'objects/recording-bytes' },
  mimeType: recording.mimeType,
  size: recording.size,
  sha256: null,
};
const completion = {
  primaryRecordingId: recording.id,
  projectId: null,
  recordingId: 'producer-session',
};
const journal: AssetReadyJournal = {
  journalId: 'saved-journal',
  createdAt: 2,
  domain: 'recording-assets',
  assetRefs: [ref],
  payload: {
    entries: [recording],
    completion,
    expectedAssetIds: { [recording.id]: null },
    recoverySources: {
      [recording.id]: { id: 'safety-copy', incarnation: 'incarnation', epoch: 'epoch' },
    },
  },
};

function setup() {
  let failCapture = false;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => failCapture && name === 'sync_capture'
  );
  fixture.rows.set('recording_telemetry', new Map());
  fixture.rows.set('state_manager', new Map());
  fixture.rows.set(
    'recording_recovery_sessions',
    new Map<string, unknown>([
      ['@epoch', { id: '@epoch', token: 'epoch' }],
      [
        'safety-copy',
        {
          id: 'safety-copy',
          recoveryId: recording.id,
          incarnation: 'incarnation',
          epoch: 'epoch',
          filename: recording.filename,
          mimeType: recording.mimeType,
          createdAt: 1,
          size: 6,
          blockCount: 1,
          complete: true,
          published: false,
        },
      ],
    ])
  );
  fixture.rows.set(
    'recording_recovery_blocks',
    new Map([['retained-block', { bytes: new Uint8Array([1, 2, 3]) }]])
  );
  fixture.rows.get('sync_capture')!.set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'recording-space',
    connectionGeneration: 1,
  });
  const database = {
    transaction(stores: string[], mode: string, options?: { durability?: string }) {
      const tx = fixture.database.transaction(stores, mode);
      return {
        abort: () => tx.abort(),
        durability: options?.durability ?? 'default',
        objectStore(name: string) {
          const store = tx.objectStore(name);
          if (name !== 'state_manager' && name !== 'recording_telemetry') return store;
          const encode = (value: unknown) => {
            if (!isRecord(value)) throw new Error('Invalid fixture row');
            const key =
              name === 'state_manager'
                ? JSON.stringify([value['domain'], value['key']])
                : value['recordingId'];
            return { ...value, id: key };
          };
          return {
            ...store,
            put: (value: unknown) => store.put(encode(value)),
            add: (value: unknown) => store.add(encode(value)),
          };
        },
        get done() {
          return tx.done;
        },
      };
    },
  };
  io.mutation.mockImplementation(async (operation) => operation(database));
  const captures = () =>
    [...fixture.rows.get('sync_capture')!.values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'sync-operation');
  return {
    ...fixture,
    captures,
    failCapture: (value: boolean) => {
      failCapture = value;
    },
  };
}

it('publishes one saved original, recovery flag, capture and completion atomically and replays once', async () => {
  const data = setup();
  await publishRecordingAssetJournal(journal);
  expect(data.captures()).toHaveLength(1);
  expect(data.captures()[0]).toMatchObject({
    phase: 'native',
    rootKind: 'media',
    rootId: `recording:${recording.id}`,
    publicationId: journal.journalId,
    generation: 1,
    change: { kind: 'media', rows: { recording, telemetry: null, ref } },
  });
  expect(data.rows.get('recordings')!.get(recording.id)).toEqual(parseRecordingEntry(recording));
  expect(data.rows.get('state_manager')!.size).toBe(1);
  expect(data.rows.get('recording_recovery_sessions')!.get('safety-copy')).toMatchObject({
    published: true,
  });
  const accepted = structuredClone(data.rows);
  await publishRecordingAssetJournal(journal);
  expect(data.rows).toEqual(accepted);
});

it('rolls back refused publication and outbox while retaining the original safety copy', async () => {
  const data = setup();
  const before = structuredClone(data.rows);
  data.failCapture(true);
  await expect(publishRecordingAssetJournal(journal)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(data.rows).toEqual(before);
  data.failCapture(false);
  await publishRecordingAssetJournal(journal);
  expect(data.captures()).toHaveLength(1);
  expect(data.rows.get('recording_recovery_blocks')).toEqual(
    before.get('recording_recovery_blocks')
  );
});

it('refuses a late journal after the same recording identity receives a different original', async () => {
  const data = setup();
  data.rows.get('recordings')!.set(recording.id, { ...recording, assetId: 'newer-source' });
  const before = structuredClone(data.rows);
  await expect(publishRecordingAssetJournal(journal)).rejects.toThrow();
  expect(data.rows).toEqual(before);
});

it('captures telemetry save and absence atomically and rolls back refused telemetry', async () => {
  const data = setup();
  await publishRecordingAssetJournal(journal);
  const telemetry = {
    recordingId: recording.id,
    actionEvents: [],
    signals: [],
    cursorTrack: null,
    viewport: null,
    captureMode: null,
    createdAt: 2,
    updatedAt: 3,
  };
  await saveRecordingTelemetry(telemetry);
  expect(data.captures().at(-1)).toMatchObject({
    generation: 2,
    change: { kind: 'media', rows: { recording, telemetry, ref } },
  });
  const before = structuredClone(data.rows);
  data.failCapture(true);
  await expect(deleteRecordingTelemetry(recording.id)).rejects.toThrow();
  expect(data.rows).toEqual(before);
  data.failCapture(false);
  await deleteRecordingTelemetry(recording.id);
  expect(data.captures().at(-1)).toMatchObject({
    generation: 3,
    change: { kind: 'media', rows: { recording, telemetry: null, ref } },
  });
});

it('keeps unpublished telemetry local until canonical publication captures its after-image', async () => {
  const data = setup();
  const telemetry = {
    recordingId: recording.id,
    actionEvents: [],
    signals: [],
    cursorTrack: null,
    viewport: null,
    captureMode: null,
    createdAt: 2,
    updatedAt: 3,
  };
  await saveRecordingTelemetry(telemetry);
  expect(data.captures()).toEqual([]);
  await publishRecordingAssetJournal(journal);
  expect(data.captures()[0]).toMatchObject({ change: { kind: 'media', rows: { telemetry } } });
});
