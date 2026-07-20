import { describe, expect, it } from 'vitest';

import { parseVideoPreviewCacheRecord } from './model';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;

function createRecord() {
  return {
    byteLength: 999,
    codec: 'avc1.42E01E',
    contentRevision: DIGEST_A,
    createdAt: 100,
    fps: 30,
    height: 2160,
    lastAccessedAt: 200,
    mimeType: 'video/mp4',
    projectId: 'project-1',
    range: { endFrame: 120, startFrame: 0 },
    schemaVersion: 2,
    segments: [
      {
        blob: new Blob(['first'], { type: 'video/mp4' }),
        endFrame: 60,
        fingerprint: DIGEST_B,
        index: 0,
        startFrame: 0,
      },
    ],
    storageKey: DIGEST_A,
    width: 3840,
  };
}

describe('video preview cache record boundary', () => {
  it('validates unknown rows and recomputes byte length from segment blobs', () => {
    const parsed = parseVideoPreviewCacheRecord(createRecord());

    expect(parsed).toEqual({ ...createRecord(), byteLength: 5 });
  });

  it('rejects malformed digests, media, dimensions, ranges, and duplicate segments', () => {
    const record = createRecord();
    const malformed = [
      { ...record, contentRevision: 'a'.repeat(64) },
      { ...record, codec: 'avc1.invalid' },
      { ...record, mimeType: 'text/plain' },
      { ...record, width: 3839 },
      { ...record, range: { startFrame: 120, endFrame: 0 } },
      { ...record, segments: [record.segments[0], record.segments[0]] },
      {
        ...record,
        segments: [record.segments[0], { ...record.segments[0], index: 1, startFrame: 30 }],
      },
    ];

    for (const value of malformed) expect(parseVideoPreviewCacheRecord(value)).toBeNull();
  });
});
