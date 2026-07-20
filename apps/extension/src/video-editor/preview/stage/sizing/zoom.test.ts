import { describe, expect, it } from 'vitest';

import { resolvePreviewStageSizeStyle } from './zoom';

describe('video editor preview zoom', () => {
  it('keeps fit responsive and author zoom independent from the raster', () => {
    expect(resolvePreviewStageSizeStyle({ width: 1920, height: 1080 }, 'fit')).toEqual({
      aspectRatio: '1920 / 1080',
      flex: '0 0 auto',
      height: 'min(100cqh, calc(100cqw * 0.5625))',
      maxHeight: '100%',
      maxWidth: '100%',
      width: 'min(100cqw, calc(100cqh * 1.7777777777777777))',
    });
    expect(resolvePreviewStageSizeStyle({ width: 1920, height: 1080 }, '75%')).toMatchObject({
      height: '810px',
      width: '1440px',
    });
  });
});
