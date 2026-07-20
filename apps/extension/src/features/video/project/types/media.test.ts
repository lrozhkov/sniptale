import { expect, it } from 'vitest';
import { VideoMediaFitMode, VideoMediaShadowMode } from './media';

it('keeps media fit modes as stable persisted literals', () => {
  expect(VideoMediaFitMode).toEqual({
    CONTAIN: 'CONTAIN',
    SOURCE_100: 'SOURCE_100',
    FIT_LONG_SIDE: 'FIT_LONG_SIDE',
    FIT_SHORT_SIDE: 'FIT_SHORT_SIDE',
    COVER: 'COVER',
    STRETCH: 'STRETCH',
  });
});

it('keeps media shadow modes as stable persisted literals', () => {
  expect(VideoMediaShadowMode).toEqual({
    BACKDROP: 'BACKDROP',
    GLOW: 'GLOW',
  });
});
