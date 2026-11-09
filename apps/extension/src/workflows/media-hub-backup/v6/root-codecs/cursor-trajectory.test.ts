import { expect, it } from 'vitest';
import {
  isPortableCursorTrajectoryAttachment,
  portableRecordingTelemetry,
  type PortableCursorTrajectoryAttachment,
} from './cursor-trajectory';

function fixture(totalBlocks = 33): PortableCursorTrajectoryAttachment {
  return {
    recordingId: 'local-restored-recording',
    sourceRecordingId: 'original-recording',
    width: 160,
    height: 90,
    objectId: 'cursor-stream',
    descriptor: {
      format: 'cursor-trajectory-v1',
      formatVersion: 1,
      algorithm: 'sed-window-v1',
      encoding: 'json-ascii-int-v1',
      trajectoryId: 'a'.repeat(32),
      state: 'complete',
      finalized: true,
      totalBlocks,
      totalRecords: totalBlocks * 2,
      totalSamples: totalBlocks,
      totalBytes: totalBlocks * 128,
      streamSha256: 'b'.repeat(64),
    },
  };
}

it('keeps one object reference for short and long histories with separate local and canonical identities', () => {
  for (const blocks of [1, 33, 27720, 1000000]) {
    const attachment = fixture(blocks);
    expect(isPortableCursorTrajectoryAttachment(attachment)).toBe(true);
    expect(JSON.stringify(attachment).length).toBeLessThan(650);
    expect(JSON.stringify(attachment)).not.toContain('writerGeneration');
  }
});

it('refuses private fields, invalid associations, provisional and empty attachments', () => {
  const attachment = fixture();
  for (const value of [
    { ...attachment, writerGeneration: 'private' },
    { ...attachment, width: 0 },
    { ...attachment, height: Infinity },
    { ...attachment, recordingId: 'local/private' },
    { ...attachment, sourceRecordingId: 'original/private' },
    { ...attachment, objectId: '../block' },
    { ...attachment, objectId: '' },
    { ...attachment, descriptor: { ...attachment.descriptor, finalized: false } },
    { ...attachment, descriptor: { ...attachment.descriptor, totalBlocks: 0 } },
    {
      ...attachment,
      descriptor: { ...attachment.descriptor, totalBytes: Number.MAX_SAFE_INTEGER },
    },
  ])
    expect(isPortableCursorTrajectoryAttachment(value)).toBe(false);
});

it('omits private native file identities for both histories from portable facts', () => {
  const recordingEvents = {
    format: 'recording-events-v1' as const,
    formatVersion: 1 as const,
    algorithm: 'lossless-v1' as const,
    encoding: 'json-utf8-v1' as const,
    eventStreamId: 'b'.repeat(32),
    state: 'incomplete' as const,
    finalized: true,
    totalBlocks: 1,
    totalRecords: 3,
    totalBytes: 512,
    streamSha256: 'd'.repeat(64),
  };
  const ref = {
    assetId: 'private-file',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/private-file' },
    mimeType: 'application/octet-stream',
    size: 516,
    sha256: recordingEvents.streamSha256,
  };
  const portable = portableRecordingTelemetry({
    recordingId: 'local',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    recordingEvents,
    recordingEventsSnapshot: { ref, sourceRecordingId: 'canonical' },
  });
  expect(portable).not.toHaveProperty('recordingEventsSnapshot');
  expect(portable).not.toHaveProperty('cursorTrajectorySnapshot');
  expect(portable.recordingEvents).toEqual(recordingEvents);
});
