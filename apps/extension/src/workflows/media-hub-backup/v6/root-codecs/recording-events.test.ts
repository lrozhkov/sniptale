import { expect, it } from 'vitest';
import {
  isPortableRecordingEventsAttachment,
  type PortableRecordingEventsAttachment,
} from './recording-events';
function fixture(blocks = 33): PortableRecordingEventsAttachment {
  return {
    recordingId: 'local-recording',
    sourceRecordingId: 'original-recording',
    objectId: 'events-stream',
    descriptor: {
      format: 'recording-events-v1',
      formatVersion: 1,
      algorithm: 'lossless-v1',
      encoding: 'json-utf8-v1',
      eventStreamId: 'b'.repeat(32),
      state: 'incomplete',
      finalized: true,
      totalBlocks: blocks,
      totalRecords: blocks * 2,
      totalBytes: blocks * 128,
      streamSha256: 'd'.repeat(64),
    },
  };
}
it('keeps short and long event histories in one compact portable object reference', () => {
  for (const blocks of [1, 33, 27720, 1000000]) {
    const attachment = fixture(blocks);
    expect(isPortableRecordingEventsAttachment(attachment)).toBe(true);
    expect(JSON.stringify(attachment).length).toBeLessThan(600);
  }
});
it('refuses private, unsafe, empty or provisional attachment facts', () => {
  const attachment = fixture();
  for (const value of [
    { ...attachment, writerGeneration: 'private' },
    { ...attachment, manifest: [] },
    { ...attachment, recordingId: '../local' },
    { ...attachment, sourceRecordingId: 'private/source' },
    { ...attachment, objectId: '../bytes' },
    { ...attachment, objectId: '' },
    { ...attachment, descriptor: { ...attachment.descriptor, finalized: false } },
    { ...attachment, descriptor: { ...attachment.descriptor, totalBlocks: 0 } },
    {
      ...attachment,
      descriptor: { ...attachment.descriptor, totalBytes: Number.MAX_SAFE_INTEGER },
    },
  ])
    expect(isPortableRecordingEventsAttachment(value)).toBe(false);
});
