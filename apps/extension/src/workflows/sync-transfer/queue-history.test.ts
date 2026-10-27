import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  installPersistenceLockManagerForTests,
  isActivePersistenceMutationPermit,
  runWithPersistentDataErasureBarrier,
} from '../../composition/persistence/infrastructure/mutation-barrier';
import type { SyncQueueHistoryBatch } from '../../composition/persistence/sync-capture/queue-history';
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import { createEventHistory } from '../../composition/persistence/diagnostics/event-history';
import type { EventHistoryDatabase } from '../../composition/persistence/diagnostics/event-history-database';
import { deliverSyncQueueHistory } from './queue-history';

const io = vi.hoisted(() => ({
  database: vi.fn(),
  load: vi.fn(),
  acknowledge: vi.fn(),
  append: vi.fn(),
  createLog: vi.fn(),
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', () => ({
  initDB: io.database,
}));
vi.mock('../../composition/persistence/sync-capture/queue-history', () => ({
  loadSyncQueueHistoryBatch: io.load,
  acknowledgeSyncQueueHistory: io.acknowledge,
}));
vi.mock('../../composition/persistence/diagnostics/runtime-log', () => ({
  createRuntimeLog: io.createLog,
}));
const scope = { spaceId: 'private-space', connectionGeneration: 3, profileCreatedAt: 1 };
const source = { kind: 'operation' as const, operationId: 'private-filename.png' };
function batch(): SyncQueueHistoryBatch {
  return {
    scope,
    source,
    sourceRef: 'a'.repeat(64),
    deliveredSequence: 0,
    throughSequence: 1,
    skipped: 0,
    transitions: [
      {
        sequence: 1,
        code: 'enqueued',
        operationRef: 'b'.repeat(64),
        stage: 'queued',
        attemptId: null,
      },
    ],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  io.database.mockResolvedValue(undefined);
  io.load.mockResolvedValue(batch());
  io.acknowledge.mockResolvedValue(undefined);
  io.append.mockResolvedValue(true);
  io.createLog.mockReturnValue({ appendConfirmed: io.append });
});
afterEach(() => installPersistenceLockManagerForTests(null));
it('admits the database before a permit and acknowledges only after confirmed publication', async () => {
  const order: string[] = [];
  io.database.mockImplementation(async () => {
    order.push('database');
  });
  io.load.mockImplementation(async () => {
    order.push('load');
    return batch();
  });
  io.append.mockImplementation(async (_rows, permit) => {
    expect(isActivePersistenceMutationPermit(permit)).toBe(true);
    order.push('history');
    return true;
  });
  io.acknowledge.mockImplementation(async (selected, permit) => {
    expect(selected).toEqual(batch());
    expect(isActivePersistenceMutationPermit(permit)).toBe(true);
    expect(permit).toBe(io.append.mock.calls[0]![1]);
    order.push('acknowledge');
  });
  expect(await deliverSyncQueueHistory(scope, source)).toBe(true);
  expect(order).toEqual(['database', 'load', 'history', 'acknowledge']);
  expect(isActivePersistenceMutationPermit(io.append.mock.calls[0]![1])).toBe(false);
});
it.each(['refused', 'failed'] as const)(
  'retains the cursor when history is %s',
  async (failure) => {
    if (failure === 'refused') io.append.mockResolvedValue(false);
    else io.append.mockRejectedValue(new Error('quota'));
    expect(await deliverSyncQueueHistory(scope, source)).toBe(false);
    expect(io.acknowledge).not.toHaveBeenCalled();
  }
);
it('replays the same safe event identity after acknowledgement fails', async () => {
  io.acknowledge.mockRejectedValueOnce(new Error('storage unavailable'));
  expect(await deliverSyncQueueHistory(scope, source)).toBe(false);
  expect(await deliverSyncQueueHistory(scope, source)).toBe(true);
  const first: unknown = io.append.mock.calls[0]![0];
  const second: unknown = io.append.mock.calls[1]![0];
  expect(first).toEqual([
    expect.objectContaining({ message: expect.stringContaining(`eventRef=${'a'.repeat(64)}:1`) }),
  ]);
  expect(second).toEqual([
    expect.objectContaining({ message: expect.stringContaining(`eventRef=${'a'.repeat(64)}:1`) }),
  ]);
  expect(JSON.stringify(first)).not.toContain('private-filename');
  expect(JSON.stringify(first)).not.toContain('private-space');
  expect(io.acknowledge).toHaveBeenCalledTimes(2);
});
it('records an explicit history gap and the remaining fixed native transitions', async () => {
  const selected = batch();
  selected.skipped = 3;
  selected.throughSequence = 4;
  selected.transitions = [
    {
      sequence: 4,
      code: 'failed',
      operationRef: 'b'.repeat(64),
      stage: 'writing',
      attemptId: '11111111-1111-4111-8111-111111111111',
    },
  ];
  io.load.mockResolvedValue(selected);
  expect(await deliverSyncQueueHistory(scope, source)).toBe(true);
  expect(io.append.mock.calls[0]![0]).toEqual([
    expect.objectContaining({
      message: `sync.history-gap eventRef=${'a'.repeat(64)}:3:gap missing=3`,
      dropped: 3,
      level: 'warn',
    }),
    expect.objectContaining({
      message: expect.stringContaining('sync.failed stage=writing'),
      level: 'warn',
    }),
  ]);
});
it('does not write when already delivered, profile admission fails, or erasure excludes a permit', async () => {
  io.load.mockResolvedValueOnce({ ...batch(), deliveredSequence: 1, transitions: [] });
  expect(await deliverSyncQueueHistory(scope, source)).toBe(true);
  expect(io.append).not.toHaveBeenCalled();
  io.load.mockRejectedValueOnce(new Error('Sync queue profile changed.'));
  expect(await deliverSyncQueueHistory(scope, source)).toBe(false);
  expect(io.append).not.toHaveBeenCalled();
  io.load.mockClear();
  installPersistenceLockManagerForTests({
    request: async (_name, options, work) => work(options.ifAvailable ? null : {}),
  });
  expect(await deliverSyncQueueHistory(scope, source)).toBe(false);
  expect(io.load).not.toHaveBeenCalled();
  expect(io.acknowledge).not.toHaveBeenCalled();
});
it('detaches selection before delayed database admission', async () => {
  let release!: () => void;
  io.database.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  const selectedScope = structuredClone(scope);
  const selectedSource = structuredClone(source);
  const pending = deliverSyncQueueHistory(selectedScope, selectedSource);
  selectedScope.profileCreatedAt = 99;
  selectedSource.operationId = 'changed';
  release();
  expect(await pending).toBe(true);
  expect(io.load).toHaveBeenCalledWith(scope, source);
});

it('exports actual confirmed sync rows through the existing runtime tail and history ZIP', async () => {
  let state: unknown;
  let active: string[] = [];
  let tail: Record<string, unknown> = {};
  const database: EventHistoryDatabase = {
    readState: async () => state,
    readActive: async () => active,
    list: async () => [],
    readArchive: async () => undefined,
    commit: async (next, text, replace) => {
      state = next;
      if (replace) active = [];
      active.push(text);
    },
    erase: async () => {
      state = undefined;
      active = [];
    },
    verifyEmpty: async () => state === undefined && active.length === 0,
  };
  const history = createEventHistory({
    database,
    legacy: async () => '',
    withLock: async (work) => work(),
  });
  const { createRuntimeLog } = await vi.importActual<
    typeof import('../../composition/persistence/diagnostics/runtime-log')
  >('../../composition/persistence/diagnostics/runtime-log');
  const log = createRuntimeLog({
    area: {
      get: async () => tail,
      set: async (next) => {
        tail = next;
      },
    },
    history,
    withLock: async (work) => work(),
  });
  io.createLog.mockReturnValue(log);
  expect(await deliverSyncQueueHistory(scope, source)).toBe(true);
  expect((await log.read())[0]).toMatchObject({
    source: 'SyncQueue',
    context: 'sync-delivery',
    message: expect.stringContaining('sync.enqueued'),
  });
  const zip = new ZipReader(new BlobReader(await history.exportZip()), { useWebWorkers: false });
  try {
    const entries = await zip.getEntries();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    if (!entry || entry.directory) throw new Error('Expected JSONL history member.');
    const text = await entry.getData(new TextWriter(), { checkSignature: true });
    expect(text).toContain(`eventRef=${'a'.repeat(64)}:1`);
    expect(text).not.toContain('private-filename');
    expect(text).not.toContain('private-space');
  } finally {
    await zip.close();
  }
});
it('drains confirmed publication and acknowledgement before privacy erasure', async () => {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.append.mockImplementation(async () => {
    entered();
    await gate;
    return true;
  });
  const delivery = deliverSyncQueueHistory(scope, source);
  await ready;
  let erased = false;
  const erasure = runWithPersistentDataErasureBarrier(async () => {
    expect(io.acknowledge).toHaveBeenCalledOnce();
    erased = true;
  });
  expect(erased).toBe(false);
  release();
  expect(await delivery).toBe(true);
  await erasure;
  expect(erased).toBe(true);
  expect(isActivePersistenceMutationPermit(io.append.mock.calls[0]![1])).toBe(false);
});
