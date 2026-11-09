import { describe, expect, it } from 'vitest';

import { parseRecordingTelemetryEntry } from './telemetry.guards.ts';

function createCursorTrack() {
  return {
    captureMode: 'separate',
    samples: [{ id: 'sample-1', time: 0.1, visible: true, x: 10, y: 20 }],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: true,
    },
  } as const;
}

function createViewport() {
  return {
    devicePixelRatio: 2,
    height: 720,
    outerHeight: 860,
    outerWidth: 1300,
    scrollX: 0,
    scrollY: 100,
    viewportOffsetX: 10,
    viewportOffsetY: 30,
    width: 1280,
  } as const;
}

function createTelemetryEntry() {
  return {
    actionEvents: [
      {
        data: { button: 0 },
        duration: 0.4,
        id: 'action-1',
        kind: 'CLICK',
        label: 'Click',
        point: { x: 10, y: 20 },
        preset: 'CLICK_RIPPLE',
        time: 0.2,
      },
    ],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: createCursorTrack(),
    displaySurface: 'browser',
    recordingId: 'recording-1',
    signals: [
      {
        data: { dwellMs: 1200 },
        endTime: 1.2,
        id: 'signal-1',
        kind: 'cursor-idle',
        point: null,
        startTime: 0.2,
      },
    ],
    updatedAt: 2,
    viewport: createViewport(),
  };
}

describe('shared recording telemetry db guards', () => {
  it('parses valid telemetry entries', () => {
    expect(parseRecordingTelemetryEntry(createTelemetryEntry())).toEqual(
      expect.objectContaining({
        actionEvents: expect.any(Array),
        recordingId: 'recording-1',
        signals: expect.any(Array),
      })
    );
  });

  it('rejects malformed telemetry payloads', () => {
    expect(
      parseRecordingTelemetryEntry({
        ...createTelemetryEntry(),
        captureMode: null,
        cursorTrack: {
          ...createCursorTrack(),
          samples: [{ id: 1, time: 0.1, visible: true, x: 10, y: 20 }],
        },
        viewport: null,
      })
    ).toBeNull();
  });

  it('rejects semantically invalid identity, timestamps, and temporal ranges', () => {
    expect(
      parseRecordingTelemetryEntry({ ...createTelemetryEntry(), recordingId: '  ' })
    ).toBeNull();
    expect(parseRecordingTelemetryEntry({ ...createTelemetryEntry(), updatedAt: 0 })).toBeNull();
    expect(
      parseRecordingTelemetryEntry({
        ...createTelemetryEntry(),
        signals: [
          {
            ...createTelemetryEntry().signals[0],
            endTime: 0.1,
            startTime: 0.2,
          },
        ],
      })
    ).toBeNull();
  });

  it('backfills missing segmented telemetry arrays for legacy entries', () => {
    const { signals: _signals, ...legacyEntry } = createTelemetryEntry();

    expect(parseRecordingTelemetryEntry(legacyEntry)).toEqual(
      expect.objectContaining({
        recordingId: 'recording-1',
        signals: [],
      })
    );
  });
});

it('retains verified native provenance and legacy rows without inventing time semantics', () => {
  const entry = createTelemetryEntry();
  const provenance = {
    source: 'native',
    normalizationVersion: 1,
    timeUnit: 'seconds',
    coordinateSpace: 'desktop',
  };
  expect(parseRecordingTelemetryEntry(entry)).not.toHaveProperty('provenance');
  expect(parseRecordingTelemetryEntry({ ...entry, provenance })?.provenance).toEqual(provenance);
  for (const patch of [
    { timeUnit: 'milliseconds' },
    { normalizationVersion: 2 },
    { secret: 'unexpected' },
  ])
    expect(
      parseRecordingTelemetryEntry({ ...entry, provenance: { ...provenance, ...patch } })
    ).toBeNull();
});

it('roundtrips browser source semantics and document capabilities without claiming omitted legacy support', () => {
  const provenance = {
    source: 'browser',
    normalizationVersion: 1,
    timeUnit: 'seconds',
    coordinateSpace: 'client-css',
  };
  const capabilities = {
    version: 1,
    pointer: 'available',
    keyboard: 'available',
    wheel: 'available',
    coverage: 'document',
  };
  const entry = { ...createTelemetryEntry(), provenance, capabilities };
  expect(parseRecordingTelemetryEntry(JSON.parse(JSON.stringify(entry)))).toMatchObject({
    provenance,
    capabilities,
  });
  expect(parseRecordingTelemetryEntry(createTelemetryEntry())).not.toHaveProperty('capabilities');
  for (const patch of [
    { version: 2 },
    { coverage: 'global' },
    { keyboard: 'always' },
    { secret: 'private' },
  ])
    expect(
      parseRecordingTelemetryEntry({ ...entry, capabilities: { ...capabilities, ...patch } })
    ).toBeNull();
  expect(
    parseRecordingTelemetryEntry({
      ...entry,
      provenance: { ...provenance, coordinateSpace: 'desktop' },
    })
  ).toBeNull();
});

it('binds a local immutable cursor snapshot to its finalized framed hash and geometry', () => {
  const descriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: 'a'.repeat(32),
    state: 'complete',
    finalized: true,
    totalBlocks: 1,
    totalRecords: 3,
    totalSamples: 1,
    totalBytes: 512,
    streamSha256: 'b'.repeat(64),
  };
  const ref = {
    assetId: 'cursor-file',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/cursor-file' },
    mimeType: 'application/octet-stream',
    size: 516,
    sha256: descriptor.streamSha256,
  };
  const snapshot = { ref, sourceRecordingId: 'canonical-recording', width: 160, height: 90 };
  const entry = {
    ...createTelemetryEntry(),
    cursorTrack: null,
    cursorTrajectory: descriptor,
    cursorTrajectorySnapshot: snapshot,
  };
  expect(parseRecordingTelemetryEntry(entry)?.cursorTrajectorySnapshot).toEqual(snapshot);
  for (const cursorTrajectorySnapshot of [
    { ...snapshot, width: 0 },
    { ...snapshot, height: 0x100000000 },
    { ...snapshot, sourceRecordingId: '../private' },
    { ...snapshot, writerGeneration: 'private' },
    { ...snapshot, ref: { ...ref, size: 512 } },
    { ...snapshot, ref: { ...ref, sha256: null } },
    { ...snapshot, ref: { ...ref, sha256: 'c'.repeat(64) } },
    { ...snapshot, ref: { ...ref, mimeType: 'video/webm' } },
  ])
    expect(parseRecordingTelemetryEntry({ ...entry, cursorTrajectorySnapshot })).toBeNull();
  expect(parseRecordingTelemetryEntry({ ...entry, cursorTrajectory: undefined })).toBeNull();
  expect(
    parseRecordingTelemetryEntry({
      ...entry,
      cursorTrajectory: { ...descriptor, finalized: false },
    })
  ).toBeNull();
});

it('binds event snapshot references to the exact finalized descriptor and original stream size', () => {
  const recordingEvents = {
    format: 'recording-events-v1',
    formatVersion: 1,
    algorithm: 'lossless-v1',
    encoding: 'json-utf8-v1',
    eventStreamId: 'b'.repeat(32),
    state: 'incomplete',
    finalized: true,
    totalBlocks: 1,
    totalRecords: 3,
    totalBytes: 512,
    streamSha256: 'd'.repeat(64),
  };
  const recordingEventsSnapshot = {
    sourceRecordingId: 'canonical',
    ref: {
      assetId: 'events-file',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/events-file' },
      mimeType: 'application/octet-stream',
      size: 516,
      sha256: recordingEvents.streamSha256,
    },
  };
  const value = { ...createTelemetryEntry(), recordingEvents, recordingEventsSnapshot };
  expect(parseRecordingTelemetryEntry(value)).not.toBeNull();
  expect(parseRecordingTelemetryEntry({ ...value, recordingEvents: undefined })).toBeNull();
  expect(
    parseRecordingTelemetryEntry({
      ...value,
      recordingEvents: { ...recordingEvents, finalized: false },
    })
  ).toBeNull();
  expect(
    parseRecordingTelemetryEntry({
      ...value,
      recordingEventsSnapshot: {
        ...recordingEventsSnapshot,
        ref: { ...recordingEventsSnapshot.ref, size: 512 },
      },
    })
  ).toBeNull();
  expect(
    parseRecordingTelemetryEntry({
      ...value,
      recordingEventsSnapshot: { ...recordingEventsSnapshot, rawBlocks: [] },
    })
  ).toBeNull();
});
