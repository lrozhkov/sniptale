import { describe, expect, it } from 'vitest';

import { VIDEO_PREVIEW_CACHE_MAX_BYTES, VIDEO_PREVIEW_CACHE_MAX_RECORDS } from './constants';
import { selectVideoPreviewCacheEvictions } from './retention';
import type { VideoPreviewCacheRecord } from './model';

function record(
  storageKey: string,
  lastAccessedAt: number,
  byteLength = 10
): VideoPreviewCacheRecord {
  return {
    byteLength,
    codec: 'avc1.42E01E',
    contentRevision: `sha256:${'a'.repeat(64)}`,
    createdAt: lastAccessedAt,
    fps: 30,
    height: 1440,
    lastAccessedAt,
    mimeType: 'video/mp4',
    projectId: `project-${storageKey}`,
    range: { endFrame: 60, startFrame: 0 },
    schemaVersion: 2,
    segments: [],
    storageKey: `sha256:${storageKey.padEnd(64, '0')}`,
    width: 2560,
  };
}

describe('video preview retention', () => {
  it('evicts expired and least-recently-used records to both caps', () => {
    const now = 20 * 24 * 60 * 60 * 1000;
    const records = Array.from({ length: VIDEO_PREVIEW_CACHE_MAX_RECORDS + 2 }, (_value, index) =>
      record(String(index), now - index)
    );
    records.push(record('expired', 0));
    records.push(record('future', now + 1));

    const evictions = selectVideoPreviewCacheEvictions(records, now);

    expect(evictions).toContain(records.at(-1)?.storageKey);
    expect(evictions).toContain(records.at(-2)?.storageKey);
    expect(evictions).toContain(records[VIDEO_PREVIEW_CACHE_MAX_RECORDS + 1]?.storageKey);
    expect(records.length - evictions.length).toBe(VIDEO_PREVIEW_CACHE_MAX_RECORDS);
  });

  it('rejects a record that cannot fit within the byte ceiling', () => {
    const oversized = record('oversized', 1, VIDEO_PREVIEW_CACHE_MAX_BYTES + 1);
    expect(() => selectVideoPreviewCacheEvictions([oversized], 1, oversized.storageKey)).toThrow(
      'exceeds the retained byte limit'
    );
  });
});
