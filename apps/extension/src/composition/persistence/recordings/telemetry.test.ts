import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingTelemetryEntry } from './contracts';

const { initDbMock, logger } = vi.hoisted(() => ({
  initDbMock: vi.fn(),
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  RECORDING_TELEMETRY_STORE: 'recording_telemetry',
  initDB: initDbMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => logger,
}));

function createDb() {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
}

describe('shared recording telemetry db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists and deletes telemetry entries through the dedicated store', async () => {
    const db = createDb();
    initDbMock.mockResolvedValue(db);
    const { deleteRecordingTelemetry, saveRecordingTelemetry } = await import('./telemetry');

    const entry: RecordingTelemetryEntry = {
      actionEvents: [],
      captureMode: 'TAB',
      createdAt: 1,
      cursorTrack: null,
      recordingId: 'recording-1',
      signals: [],
      updatedAt: 2,
      viewport: null,
    };

    await saveRecordingTelemetry(entry);
    await deleteRecordingTelemetry('recording-1');

    expect(db.put).toHaveBeenCalledWith('recording_telemetry', entry);
    expect(db.delete).toHaveBeenCalledWith('recording_telemetry', 'recording-1');
  });

  it('drops invalid telemetry entries loaded from IndexedDB', async () => {
    const db = createDb();
    db.get.mockResolvedValue({ recordingId: 5 });
    initDbMock.mockResolvedValue(db);
    const { getRecordingTelemetry } = await import('./telemetry');

    await expect(getRecordingTelemetry('recording-1')).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      'Ignoring invalid recording telemetry entry from IndexedDB',
      {
        recordingId: 'recording-1',
      }
    );
  });
});
