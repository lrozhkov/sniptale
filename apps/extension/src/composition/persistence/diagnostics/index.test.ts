import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DiagnosticEvent,
  DiagnosticsEntry,
} from '@sniptale/platform/observability/diagnostics/types';

const diagnosticsDbMocks = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getAllMock: vi.fn(),
  getMock: vi.fn(),
  initDBMock: vi.fn(),
  metaDeleteMock: vi.fn(),
  metaPutMock: vi.fn(),
  objectStoreContainsMock: vi.fn(),
  transactionMock: vi.fn(),
  eventsDeleteMock: vi.fn(),
  eventsPutMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  DIAGNOSTICS_EVENTS_STORE: 'diagnostics_events',
  DIAGNOSTICS_META_STORE: 'diagnostics_meta',
  initDB: diagnosticsDbMocks.initDBMock,
}));

function createDiagnosticEvent(index: number): DiagnosticEvent {
  return {
    id: `event-${index}`,
    kind: 'console',
    message: `Event ${index}`,
    recordingId: 'recording-1',
    tsMs: index,
  };
}

function createDiagnosticsMeta(overrides: Partial<DiagnosticsEntry> = {}): DiagnosticsEntry {
  return {
    chunksCount: 2,
    createdAt: '2026-03-20T00:00:00.000Z',
    meta: {
      recordingStartedAt: '2026-03-20T00:00:00.000Z',
      url: 'https://example.test',
      userAgent: 'ua',
      viewportHeight: 720,
      viewportWidth: 1280,
    },
    recordingId: 'recording-1',
    schemaVersion: 1,
    totalEvents: 2,
    ...overrides,
  };
}

function createDb(options?: {
  getMock?: typeof diagnosticsDbMocks.getMock;
  getAllMock?: typeof diagnosticsDbMocks.getAllMock;
  hasEventsStore?: boolean;
  hasMetaStore?: boolean;
}) {
  const hasEventsStore = options?.hasEventsStore ?? true;
  const hasMetaStore = options?.hasMetaStore ?? true;

  diagnosticsDbMocks.objectStoreContainsMock.mockImplementation((storeName: string) => {
    if (storeName === 'diagnostics_meta') {
      return hasMetaStore;
    }
    if (storeName === 'diagnostics_events') {
      return hasEventsStore;
    }
    return false;
  });

  diagnosticsDbMocks.transactionMock.mockReturnValue({
    done: Promise.resolve(),
    objectStore: vi.fn((storeName: string) => {
      if (storeName === 'diagnostics_meta') {
        return {
          delete: diagnosticsDbMocks.metaDeleteMock,
          put: diagnosticsDbMocks.metaPutMock,
        };
      }

      return {
        delete: diagnosticsDbMocks.eventsDeleteMock,
        put: diagnosticsDbMocks.eventsPutMock,
      };
    }),
  });

  return {
    get: options?.getMock ?? diagnosticsDbMocks.getMock,
    getAll: options?.getAllMock ?? diagnosticsDbMocks.getAllMock,
    objectStoreNames: {
      contains: diagnosticsDbMocks.objectStoreContainsMock,
    },
    transaction: diagnosticsDbMocks.transactionMock,
  };
}

function resetDiagnosticsDbMocks() {
  vi.clearAllMocks();
  diagnosticsDbMocks.initDBMock.mockResolvedValue(createDb());
}

async function importDiagnosticsDbModule() {
  vi.resetModules();
  return import('./index');
}

describe('diagnostics-db save flows', () => {
  beforeEach(resetDiagnosticsDbMocks);

  it('chunks diagnostics events and persists metadata and event batches', async () => {
    const { saveDiagnostics } = await importDiagnosticsDbModule();
    const events = Array.from({ length: 1002 }, (_, index) => createDiagnosticEvent(index));

    await saveDiagnostics(
      {
        createdAt: '2026-03-20T00:00:00.000Z',
        meta: createDiagnosticsMeta().meta,
        recordingId: 'recording-1',
        schemaVersion: 1,
      },
      events
    );

    expect(diagnosticsDbMocks.transactionMock).toHaveBeenCalledWith(
      ['diagnostics_meta', 'diagnostics_events'],
      'readwrite'
    );
    expect(diagnosticsDbMocks.metaPutMock).toHaveBeenCalledWith(
      expect.objectContaining({ chunksCount: 2, totalEvents: 1002 })
    );
    expect(diagnosticsDbMocks.eventsPutMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ chunkIndex: 0, events: events.slice(0, 1000) })
    );
    expect(diagnosticsDbMocks.eventsPutMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ chunkIndex: 1, events: events.slice(1000) })
    );
  });
});

describe('diagnostics-db save failure flows', () => {
  beforeEach(resetDiagnosticsDbMocks);

  it('fails fast when diagnostics stores are missing', async () => {
    const { saveDiagnostics } = await importDiagnosticsDbModule();
    diagnosticsDbMocks.initDBMock.mockResolvedValue(
      createDb({ hasEventsStore: false, hasMetaStore: true })
    );

    await expect(
      saveDiagnostics(
        {
          createdAt: '2026-03-20T00:00:00.000Z',
          meta: createDiagnosticsMeta().meta,
          recordingId: 'recording-1',
          schemaVersion: 1,
        },
        [createDiagnosticEvent(1)]
      )
    ).rejects.toThrow('Diagnostics stores not found. Need to recreate database.');
  });
});

describe('diagnostics-db read success flows', () => {
  beforeEach(resetDiagnosticsDbMocks);

  it('reads diagnostics metadata and reconstructs contiguous chunked event lists', async () => {
    diagnosticsDbMocks.getMock.mockImplementation(async (storeName: string, key: unknown) => {
      if (storeName === 'diagnostics_meta') {
        return createDiagnosticsMeta({ chunksCount: 2 });
      }
      if (storeName === 'diagnostics_events' && Array.isArray(key) && key[1] === 0) {
        return {
          chunkIndex: 0,
          events: [createDiagnosticEvent(0)],
          recordingId: 'recording-1',
        };
      }
      if (storeName === 'diagnostics_events' && Array.isArray(key) && key[1] === 1) {
        return {
          chunkIndex: 1,
          events: [createDiagnosticEvent(1)],
          recordingId: 'recording-1',
        };
      }
      return undefined;
    });
    const { getDiagnosticsEvents, getDiagnosticsMeta } = await importDiagnosticsDbModule();

    await expect(getDiagnosticsMeta('recording-1')).resolves.toEqual(
      createDiagnosticsMeta({ chunksCount: 2 })
    );
    await expect(getDiagnosticsEvents('recording-1')).resolves.toEqual([
      createDiagnosticEvent(0),
      createDiagnosticEvent(1),
    ]);
  });
});

describe('diagnostics-db read fallback flows', () => {
  beforeEach(resetDiagnosticsDbMocks);

  it('surfaces corruption for missing chunks and invalid metadata', async () => {
    diagnosticsDbMocks.getMock.mockImplementation(async (storeName: string, key: unknown) => {
      if (storeName === 'diagnostics_meta') {
        return createDiagnosticsMeta({ chunksCount: 2 });
      }
      if (storeName === 'diagnostics_events' && Array.isArray(key) && key[1] === 0) {
        return { chunkIndex: 0, events: [createDiagnosticEvent(0)], recordingId: 'recording-1' };
      }
      return undefined;
    });
    const { getDiagnosticsEvents } = await importDiagnosticsDbModule();

    await expect(getDiagnosticsEvents('recording-1')).rejects.toThrow('missing chunk 1');

    diagnosticsDbMocks.getMock.mockResolvedValue(
      createDiagnosticsMeta({ chunksCount: 1_001, totalEvents: 1 })
    );
    await expect(getDiagnosticsEvents('recording-1')).rejects.toThrow('invalid metadata');
  });

  it('surfaces corruption for malformed event payloads before rendering', async () => {
    diagnosticsDbMocks.getMock.mockImplementation(async (storeName: string, key: unknown) => {
      if (storeName === 'diagnostics_meta') {
        return createDiagnosticsMeta({ chunksCount: 1, totalEvents: 1 });
      }
      if (storeName === 'diagnostics_events' && Array.isArray(key) && key[1] === 0) {
        return {
          chunkIndex: 0,
          events: [{ ...createDiagnosticEvent(0), data: { unsafe: new Blob(['raw']) } }],
          recordingId: 'recording-1',
        };
      }
      return undefined;
    });
    const { getDiagnosticsEvents } = await importDiagnosticsDbModule();

    await expect(getDiagnosticsEvents('recording-1')).rejects.toThrow('missing chunk 0');
  });

  it('returns empty or null payloads when diagnostics are absent', async () => {
    diagnosticsDbMocks.getMock.mockResolvedValue(undefined);
    const { getDiagnostics, getDiagnosticsEvents } = await importDiagnosticsDbModule();

    await expect(getDiagnosticsEvents('missing')).resolves.toEqual([]);
    await expect(getDiagnostics('missing')).resolves.toBeNull();
  });
});

describe('diagnostics-db cleanup flows', () => {
  beforeEach(resetDiagnosticsDbMocks);

  it('deletes diagnostics meta rows, event chunks, and old records', async () => {
    diagnosticsDbMocks.getMock.mockImplementation(async (_storeName: string, key: unknown) => {
      if (key === 'recording-1') {
        return createDiagnosticsMeta({ chunksCount: 2 });
      }
      if (key === 'old-recording') {
        return createDiagnosticsMeta({
          chunksCount: 1,
          recordingId: 'old-recording',
          totalEvents: 1,
        });
      }
      return undefined;
    });
    diagnosticsDbMocks.getAllMock.mockResolvedValue([
      createDiagnosticsMeta({
        createdAt: '2026-03-01T00:00:00.000Z',
        chunksCount: 1,
        recordingId: 'old-recording',
        totalEvents: 1,
      }),
      createDiagnosticsMeta({
        createdAt: '2026-03-23T00:00:00.000Z',
        recordingId: 'fresh-recording',
      }),
    ]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T00:00:00.000Z'));
    const { cleanupOldDiagnostics, deleteDiagnostics } = await importDiagnosticsDbModule();

    await deleteDiagnostics('recording-1');
    await expect(cleanupOldDiagnostics(7)).resolves.toBe(1);

    expect(diagnosticsDbMocks.metaDeleteMock).toHaveBeenCalledWith('recording-1');
    expect(diagnosticsDbMocks.eventsDeleteMock).toHaveBeenCalledWith(['recording-1', 0]);
    expect(diagnosticsDbMocks.eventsDeleteMock).toHaveBeenCalledWith(['recording-1', 1]);
    expect(diagnosticsDbMocks.metaDeleteMock).toHaveBeenCalledWith('old-recording');
    expect(diagnosticsDbMocks.eventsDeleteMock).toHaveBeenCalledWith(['old-recording', 0]);
    vi.useRealTimers();
  });
});
