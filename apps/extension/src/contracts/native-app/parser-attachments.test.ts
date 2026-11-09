import { expect, it } from 'vitest';
import { parseNativeAppInboundMessage } from './parser';
import { parseNativeHistoryInboundMessage } from './parser-attachments';
import eventsFixture from '../../features/video/project/recording-events/fixtures.json';
import type { CursorTrajectoryDescriptor } from '../../features/video/project/cursor-trajectory/types';

const cursorDescriptor: CursorTrajectoryDescriptor = {
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
  totalBytes: 1000,
  streamSha256: 'b'.repeat(64),
};
function identity(cursor: boolean) {
  return {
    protocolVersion: 2,
    controllerLeaseId: 'lease',
    recordingId: 'recording',
    ...(cursor
      ? { trajectoryId: cursorDescriptor.trajectoryId }
      : { eventStreamId: eventsFixture.eventStreamId }),
  };
}
function manifest(cursor: boolean) {
  return {
    ...identity(cursor),
    type: cursor ? 'app.recording.attachment.manifest' : 'app.recording.events.manifest',
    requestId: 'request',
    descriptor: cursor ? cursorDescriptor : eventsFixture.descriptor,
    fromSequence: 0,
    entries: cursor
      ? [
          {
            sequence: 0,
            startTimeUs: 0,
            endTimeUs: 1000,
            recordCount: 3,
            sampleCount: 1,
            byteLength: 1000,
            blockSha256: 'c'.repeat(64),
            prefixSha256: cursorDescriptor.streamSha256,
          },
        ]
      : eventsFixture.manifest,
    nextSequence: null,
  };
}
function chunk(cursor: boolean, total = 65536, index = 1) {
  const raw = new Uint8Array(Math.min(32768, total - index * 32768));
  return {
    ...identity(cursor),
    type: cursor ? 'app.recording.attachment.chunk' : 'app.recording.events.chunk',
    requestId: 'request',
    sequence: 0,
    blockBytes: total,
    blockSha256: 'c'.repeat(64),
    chunkIndex: index,
    chunkCount: Math.ceil(total / 32768),
    chunkByteOffset: index * 32768,
    chunkRawBytes: raw.length,
    chunkSha256: 'd'.repeat(64),
    base64: btoa(String.fromCharCode(...raw)),
  };
}
it.each([true, false])(
  'admits exact Desktop history messages with independent stream identity (cursor=%s)',
  (cursor) => {
    const page = manifest(cursor);
    expect(parseNativeHistoryInboundMessage(page)).toEqual({ ok: true, value: page });
    for (const part of [
      chunk(cursor, 65536, 0),
      chunk(cursor),
      chunk(cursor, 32769),
      chunk(cursor, 1, 0),
    ]) {
      expect(parseNativeHistoryInboundMessage(part)).toEqual({ ok: true, value: part });
    }
    const available = {
      ...identity(cursor),
      type: cursor ? 'app.recording.attachment.available' : 'app.recording.events.available',
      videoSha256: 'e'.repeat(64),
      descriptor: page.descriptor,
    };
    expect(parseNativeHistoryInboundMessage(available)).toEqual({ ok: true, value: available });
    expect(parseNativeHistoryInboundMessage({ ...available, requestId: 'unsolicited' }).ok).toBe(
      false
    );
  }
);
it.each([true, false])('refuses malformed or cross-stream manifest pages (cursor=%s)', (cursor) => {
  const valid = manifest(cursor);
  const entry = valid.entries[0]!;
  for (const patch of [
    { protocolVersion: 1 },
    { controllerLeaseId: '' },
    { recordingId: '../recording' },
    { requestId: '' },
    { transferId: 'invented' },
    { descriptor: { ...valid.descriptor, writerGeneration: 'private' } },
    {
      descriptor: {
        ...valid.descriptor,
        ...(cursor ? { trajectoryId: 'f'.repeat(32) } : { eventStreamId: 'f'.repeat(32) }),
      },
    },
    { fromSequence: -0 },
    { fromSequence: Number.MAX_SAFE_INTEGER + 1 },
    { nextSequence: 0 },
    { entries: [] },
    { entries: Array.from({ length: 33 }, () => entry) },
    ...[
      { recordCount: 513 },
      { recordCount: 0 },
      { sequence: 1 },
      { startTimeUs: 20, endTimeUs: 1 },
      { byteLength: 65537 },
      { blockSha256: 'A'.repeat(64) },
      { prefixSha256: '' },
      { unknown: true },
    ].map((change) => ({ entries: [{ ...entry, ...change }] })),
  ])
    expect(parseNativeHistoryInboundMessage({ ...valid, ...patch }).ok).toBe(false);
});
it.each([true, false])(
  'refuses invalid chunk geometry, encodings and unknown fields (cursor=%s)',
  (cursor) => {
    const valid = chunk(cursor, 32769);
    for (const patch of [
      { chunkIndex: 0 },
      { chunkCount: 1 },
      { chunkCount: 3 },
      { chunkByteOffset: 0 },
      { chunkRawBytes: 32769 },
      { chunkRawBytes: 0 },
      { blockBytes: 65537 },
      { blockBytes: 0 },
      { sequence: Number.MAX_SAFE_INTEGER + 1 },
      { sequence: -0 },
      { chunkSha256: 'unknown' },
      { base64: 'AB==' },
      { base64: 'AA' },
      { base64: 'AA==\n' },
      { base64: '' },
      { extra: true },
    ])
      expect(parseNativeHistoryInboundMessage({ ...valid, ...patch }).ok).toBe(false);
    expect(
      parseNativeHistoryInboundMessage({ ...chunk(cursor, 1, 0), chunkByteOffset: -0 }).ok
    ).toBe(false);
  }
);
it('admits a provisional cursor head for bounded manifest retry without implying a durable receipt', () => {
  const page = manifest(true);
  expect(
    parseNativeHistoryInboundMessage({
      ...page,
      descriptor: { ...cursorDescriptor, finalized: false },
    }).ok
  ).toBe(true);
  expect(parseNativeHistoryInboundMessage(null).ok).toBe(false);
  expect(parseNativeHistoryInboundMessage({ type: 'app.recording.unknown' }).ok).toBe(false);
});

it('admits bounded pages beyond 4096 blocks and exact final prefix queries', () => {
  const page = manifest(true);
  const descriptor = {
    ...cursorDescriptor,
    totalBlocks: 5000,
    totalRecords: 5000,
    totalSamples: 5000,
    totalBytes: 5000000,
  };
  const row = {
    sequence: 0,
    startTimeUs: 0,
    endTimeUs: 1,
    recordCount: 1,
    sampleCount: 1,
    byteLength: 1000,
    blockSha256: 'c'.repeat(64),
    prefixSha256: 'd'.repeat(64),
  };
  expect(
    parseNativeHistoryInboundMessage({
      ...page,
      descriptor,
      entries: Array.from({ length: 32 }, (_, sequence) => ({ ...row, sequence })),
      nextSequence: 32,
    }).ok
  ).toBe(true);
  expect(
    parseNativeHistoryInboundMessage({
      ...page,
      descriptor,
      fromSequence: 4999,
      entries: [{ ...row, sequence: 4999 }],
      nextSequence: null,
    }).ok
  ).toBe(true);
  expect(
    parseNativeHistoryInboundMessage({
      ...page,
      descriptor,
      fromSequence: 5000,
      entries: [],
      nextSequence: null,
    }).ok
  ).toBe(true);
});

it.each([true, false])(
  'routes all three history message families through the public parser (cursor=%s)',
  (cursor) => {
    const available = {
      ...identity(cursor),
      type: cursor ? 'app.recording.attachment.available' : 'app.recording.events.available',
      videoSha256: 'd'.repeat(64),
      descriptor: cursor ? cursorDescriptor : eventsFixture.descriptor,
    };
    for (const message of [manifest(cursor), chunk(cursor), available]) {
      expect(parseNativeAppInboundMessage(message)).toEqual({ ok: true, value: message });
      expect(parseNativeAppInboundMessage({ ...message, transferId: 'invented' })).toMatchObject({
        ok: false,
      });
    }
  }
);
