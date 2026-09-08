import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingActionEvent } from '../../../features/video/project/types';
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

  it('rejects invalid writes and entries stored under a mismatched recording identity', async () => {
    const db = createDb();
    db.get.mockResolvedValue({
      actionEvents: [],
      captureMode: null,
      createdAt: 1,
      cursorTrack: null,
      recordingId: 'recording-stale',
      signals: [],
      updatedAt: 2,
      viewport: null,
    });
    initDbMock.mockResolvedValue(db);
    const { getRecordingTelemetry, saveRecordingTelemetry } = await import('./telemetry');

    await expect(
      saveRecordingTelemetry({
        actionEvents: [],
        captureMode: null,
        createdAt: 2,
        cursorTrack: null,
        recordingId: 'recording-1',
        signals: [],
        updatedAt: 1,
        viewport: null,
      })
    ).rejects.toThrow('Invalid recording telemetry entry.');
    expect(db.put).not.toHaveBeenCalled();

    await expect(getRecordingTelemetry('recording-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Ignoring invalid recording telemetry entry from IndexedDB',
      { recordingId: 'recording-1' }
    );
  });
});

it('roundtrips native time provenance without changing existing event times', async () => {
  const action: RecordingActionEvent = {
    id: 'raw-click',
    kind: 'CLICK',
    time: 1.25,
    duration: 0.25,
    point: { x: -20, y: 40 },
    label: 'Click',
    data: { button: 0 },
    preset: 'CLICK_RIPPLE',
    animation: { start: 1, end: 1.5, duration: 0.5 },
    sourceAnchor: {
      kind: 'recording-source',
      recordingId: 'native',
      sourceClipId: 'raw-source',
      sourceTime: 1.25,
    },
    timeBasis: 'project',
  };

  const db = createDb();
  initDbMock.mockResolvedValue(db);
  const { saveRecordingTelemetry, getRecordingTelemetry } = await import('./telemetry');
  const entry: RecordingTelemetryEntry = {
    recordingId: 'native',
    createdAt: 1,
    updatedAt: 1,
    captureMode: 'SCREEN',
    viewport: null,
    cursorTrack: null,
    actionEvents: [action],
    signals: [],
    provenance: {
      source: 'native',
      normalizationVersion: 1,
      timeUnit: 'seconds',
      coordinateSpace: 'desktop',
    },
  };
  await saveRecordingTelemetry(entry);
  db.get.mockResolvedValue(structuredClone(db.put.mock.calls.at(-1)![1]));
  expect(await getRecordingTelemetry('native')).toEqual(entry);
});

it('roundtrips recording-image points, unavailable geometry and raw client points independently', async () => {
  const action: RecordingActionEvent = {
    id: 'click',
    kind: 'CLICK',
    label: 'Click',
    time: 1,
    duration: 0.1,
    preset: 'CLICK_RIPPLE',
    data: {},
    point: { x: 320, y: 180 },
    recordingPoint: { x: 0.25, y: 0.75 },
  };
  const entry: RecordingTelemetryEntry = {
    recordingId: 'tab',
    createdAt: 1,
    updatedAt: 1,
    captureMode: 'TAB',
    viewport: null,
    cursorTrack: null,
    actionEvents: [action, { ...action, id: 'unavailable', recordingPoint: null }],
    signals: [],
  };
  const db = createDb();
  initDbMock.mockResolvedValue(db);
  const { saveRecordingTelemetry, getRecordingTelemetry } = await import('./telemetry');
  await saveRecordingTelemetry(entry);
  db.get.mockResolvedValue(structuredClone(db.put.mock.calls.at(-1)![1]));
  expect(await getRecordingTelemetry('tab')).toEqual(entry);
  db.get.mockResolvedValue({
    ...entry,
    actionEvents: [{ ...action, recordingPoint: { x: 2, y: 0.5 } }],
  });
  expect(await getRecordingTelemetry('tab')).toBeUndefined();
  await expect(
    saveRecordingTelemetry({
      ...entry,
      actionEvents: [{ ...action, recordingPoint: { x: 2, y: 0.5 } }],
    })
  ).rejects.toThrow('Invalid recording telemetry entry.');
});
