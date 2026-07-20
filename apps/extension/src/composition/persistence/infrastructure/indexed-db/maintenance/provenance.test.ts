import { describe, expect, it, vi } from 'vitest';
import { runProvenanceUrlMaintenance } from './provenance';

describe('db provenance URL maintenance', () => {
  it('sanitizes persisted provenance URLs in owned readwrite transactions', async () => {
    const { editorCursor, mediaCursor, snapshotCursor } = createProvenanceCursors();

    await runProvenanceUrlMaintenance(
      createMaintenanceDb({
        editor_sessions: [editorCursor],
        media_library: [mediaCursor],
        web_snapshots: [snapshotCursor],
      })
    );

    expect(mediaCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFavicon: 'https://example.com/favicon.ico',
        sourceUrl: 'https://example.com/',
      })
    );
    expect(editorCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://example.com/docs/readme',
      })
    );
    expect(snapshotCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          source: {
            faviconUrl: 'https://example.com/favicon.ico',
            url: 'https://example.com/',
          },
        }),
      })
    );
  });
});

describe('db media provenance URL maintenance', () => {
  it('patches media provenance without overwriting a newer media blob', async () => {
    const mediaRecord = {
      blob: new Blob(['old']),
      id: 'asset-1',
      sourceFavicon: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
      sourceUrl: 'https://user:pass@example.com/reset/password?token=secret#hash',
    };
    const mediaCursor = createCursor(mediaRecord);
    const newerBlob = new Blob(['new']);
    mediaCursor.currentValue = { ...mediaRecord, blob: newerBlob };

    await runProvenanceUrlMaintenance(createMaintenanceDb({ media_library: [mediaCursor] }));

    expect(mediaCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({
        blob: newerBlob,
        sourceFavicon: 'https://example.com/favicon.ico',
        sourceUrl: 'https://example.com/',
      })
    );
  });
});

describe('db media provenance current-row maintenance', () => {
  it('does not replay scan-time media provenance over a newer current row', async () => {
    const mediaRecord = createSensitiveMediaRecord();
    const mediaCursor = createCursor(mediaRecord);
    const newerBlob = new Blob(['new']);
    mediaCursor.currentValue = {
      ...mediaRecord,
      blob: newerBlob,
      sourceFavicon: null,
      sourceUrl: null,
    };

    await runProvenanceUrlMaintenance(createMaintenanceDb({ media_library: [mediaCursor] }));

    expect(mediaCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({
        blob: newerBlob,
        sourceFavicon: null,
        sourceUrl: null,
      })
    );
  });

  it('sanitizes current media provenance instead of stale cursor provenance', async () => {
    const mediaCursor = createCursor(createSensitiveMediaRecord());
    mediaCursor.currentValue = {
      id: 'asset-1',
      sourceFavicon: 'https://new.example/favicon.ico?api_key=current#hash',
      sourceUrl: 'https://new.example/invite/abc?token=current#hash',
    };

    await runProvenanceUrlMaintenance(createMaintenanceDb({ media_library: [mediaCursor] }));

    expect(mediaCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFavicon: 'https://new.example/favicon.ico',
        sourceUrl: 'https://new.example/',
      })
    );
  });
});

describe('db editor provenance URL maintenance', () => {
  it('sanitizes current editor provenance instead of stale cursor provenance', async () => {
    const editorCursor = createCursor({
      sessionId: 'session-1',
      sourceUrl: 'https://old.example/reset?token=old#hash',
    });
    editorCursor.currentValue = {
      sessionId: 'session-1',
      sourceUrl: 'https://new.example/invite/abc?token=current#hash',
    };

    await runProvenanceUrlMaintenance(createMaintenanceDb({ editor_sessions: [editorCursor] }));

    expect(editorCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://new.example/',
      })
    );
  });
});

describe('db provenance maintenance malformed records', () => {
  it('skips malformed persisted provenance records without writing repairs', async () => {
    const mediaCursor = createCursor('not a record');
    const editorCursor = createCursor(null);
    const snapshotCursor = createCursor({ id: 'snapshot-1', manifest: {} });

    await runProvenanceUrlMaintenance(
      createMaintenanceDb({
        editor_sessions: [editorCursor],
        media_library: [mediaCursor],
        web_snapshots: [snapshotCursor],
      })
    );

    expect(mediaCursor.put).not.toHaveBeenCalled();
    expect(editorCursor.put).not.toHaveBeenCalled();
    expect(snapshotCursor.put).not.toHaveBeenCalled();
  });
});

function createProvenanceCursors() {
  const mediaCursor = createCursor({
    id: 'asset-1',
    sourceFavicon: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
    sourceUrl: 'https://user:pass@example.com/reset/password?token=secret#access_token=abc',
  });
  const editorCursor = createCursor({
    sessionId: 'session-1',
    sourceUrl: 'https://example.com/docs/readme?session=secret#fragment',
  });
  const snapshotCursor = createCursor({
    id: 'snapshot-1',
    manifest: {
      source: {
        faviconUrl: 'https://user:pass@example.com/favicon.ico?token=secret',
        url: 'https://user:pass@example.com/invite/abc?token=secret#hash',
      },
    },
  });

  return { editorCursor, mediaCursor, snapshotCursor };
}

function createSensitiveMediaRecord() {
  return {
    blob: new Blob(['old']),
    id: 'asset-1',
    sourceFavicon: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
    sourceUrl: 'https://user:pass@example.com/reset/password?token=secret#hash',
  };
}

function createCursor(value: unknown) {
  return {
    currentValue: value,
    key: getRecordKey(value),
    value,
    continue: vi.fn(async () => null),
    put: vi.fn(async (_value: unknown) => undefined),
  };
}

function getRecordKey(value: unknown): IDBValidKey | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const candidate = value['id'] ?? value['sessionId'];
  return isIdbValidKey(candidate) ? candidate : undefined;
}

function isIdbValidKey(value: unknown): value is IDBValidKey {
  return typeof value === 'string' || typeof value === 'number' || value instanceof Date;
}

function createMaintenanceDb(
  cursorsByStore: Record<string, Array<ReturnType<typeof createCursor>>>
) {
  return {
    transaction: vi.fn((storeName: string, mode: 'readonly' | 'readwrite' = 'readonly') =>
      createTransaction(storeName, mode, cursorsByStore)
    ),
  };
}

function createTransaction(
  storeName: string,
  mode: 'readonly' | 'readwrite',
  cursorsByStore: Record<string, Array<ReturnType<typeof createCursor>>>
) {
  const cursor = cursorsByStore[storeName]?.[0];
  return {
    done: Promise.resolve(),
    objectStore: vi.fn(() => ({
      get: vi.fn(async () => cursor?.currentValue),
      openCursor: vi.fn(async () => (mode === 'readonly' ? createReadableCursor(cursor) : null)),
      put: vi.fn(async (value: unknown) => {
        if (cursor) {
          cursor.currentValue = value;
          await cursor.put(value);
        }
      }),
    })),
  };
}

function createReadableCursor(cursor: ReturnType<typeof createCursor> | undefined) {
  if (!cursor) {
    return null;
  }

  return {
    continue: cursor.continue,
    primaryKey: cursor.key,
    value: cursor.value,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
