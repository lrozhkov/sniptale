import { expect, it } from 'vitest';
import {
  parseTimelineThumbnail,
  timelineThumbnailKey,
  TIMELINE_THUMBNAIL_MAX_FRAME_BYTES,
} from './thumbnail-model';
const valid = {
  projectId: 'p',
  sourceKey: 's',
  sourceTime: 1.25,
  createdAt: 1,
  blob: new Blob(['x'], { type: 'image/webp' }),
};
it('admits bounded WebP records and rejects malformed storage', () => {
  expect(parseTimelineThumbnail(valid)).toEqual(valid);
  for (const value of [
    null,
    [],
    {},
    { ...valid, projectId: '' },
    { ...valid, sourceKey: '' },
    { ...valid, sourceTime: NaN },
    { ...valid, createdAt: -1 },
    { ...valid, blob: new Blob(['x']) },
    {
      ...valid,
      blob: new Blob([new Uint8Array(TIMELINE_THUMBNAIL_MAX_FRAME_BYTES + 1)], {
        type: 'image/webp',
      }),
    },
  ])
    expect(parseTimelineThumbnail(value)).toBeNull();
});
it('separates projects, sources and exact source times without delimiter collisions', () => {
  expect(
    new Set(
      [
        valid,
        { ...valid, projectId: 'q' },
        { ...valid, sourceKey: 't' },
        { ...valid, sourceTime: 1.251 },
      ].map(timelineThumbnailKey)
    ).size
  ).toBe(4);
});
