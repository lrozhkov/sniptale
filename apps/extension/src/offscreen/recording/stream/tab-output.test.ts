import { describe, expect, it } from 'vitest';

import {
  isSameTabOutputGeometry,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
} from './tab-output';

describe('tab output geometry', () => {
  it('normalizes a DPR2 full TAB source to the measured CSS viewport', () => {
    expect(
      resolveTabOutputGeometry(
        { x: 0, y: 0, width: 1280, height: 720 },
        { width: 2560, height: 1440 },
        { width: 1280, height: 720, devicePixelRatio: 2 }
      )
    ).toMatchObject({
      sourceRect: { x: 0, y: 0, width: 2560, height: 1440 },
      outputSize: { width: 1280, height: 720 },
    });
  });

  it('keeps the selected visual area while encoding a 300x300 CSS result at DPR2', () => {
    expect(
      resolveTabOutputGeometry(
        { x: 100, y: 80, width: 300, height: 300 },
        { width: 2560, height: 1440 },
        { width: 1280, height: 720, devicePixelRatio: 2 }
      )
    ).toMatchObject({
      sourceRect: { x: 200, y: 160, width: 600, height: 600 },
      outputSize: { width: 300, height: 300 },
    });
  });

  it('accepts Chrome tab output scaled independently from page DPR', () => {
    expect(
      resolveTabOutputGeometry(
        { x: 0, y: 0, width: 1425, height: 740 },
        { width: 1920, height: 998 },
        { width: 1425, height: 740, devicePixelRatio: 1.25 }
      )
    ).toMatchObject({
      sourceRect: { x: 0, y: 0, width: 1920, height: 998 },
      outputSize: { width: 1425, height: 740 },
    });
  });

  it('maps a selected region through Chrome tab output scaling', () => {
    expect(
      resolveTabOutputGeometry(
        { x: 100, y: 80, width: 300, height: 300 },
        { width: 1920, height: 998 },
        { width: 1425, height: 740, devicePixelRatio: 1.25 }
      )
    ).toMatchObject({
      sourceRect: { x: 135, y: 108, width: 404, height: 404 },
      outputSize: { width: 300, height: 300 },
    });
  });

  it('rejects a raw source whose aspect ratio does not match the viewport', () => {
    expect(() =>
      resolveTabOutputGeometry(
        { x: 0, y: 0, width: 1024, height: 768 },
        { width: 2560, height: 1440 },
        { width: 1024, height: 768, devicePixelRatio: 2 }
      )
    ).toThrow('does not match');
  });

  it('preserves odd TAB_CROP geometry instead of silently changing the selected area', () => {
    expect(
      resolveTabOutputGeometry(
        { x: 10, y: 20, width: 301, height: 299 },
        { width: 1600, height: 900 },
        { width: 800, height: 450, devicePixelRatio: 2 }
      )
    ).toMatchObject({
      requestedCrop: { x: 10, y: 20, width: 301, height: 299 },
      sourceRect: { x: 20, y: 40, width: 602, height: 598 },
      outputSize: { width: 301, height: 299 },
    });
  });

  it('preserves an odd full-TAB viewport when its physical mapping is exact', () => {
    expect(
      resolveTabOutputGeometry(
        { x: 0, y: 0, width: 1279, height: 721 },
        { width: 2558, height: 1442 },
        { width: 1279, height: 721, devicePixelRatio: 2 }
      )
    ).toMatchObject({
      sourceRect: { x: 0, y: 0, width: 2558, height: 1442 },
      outputSize: { width: 1279, height: 721 },
    });
  });

  it('revalidates through the same mapping owner and rejects changed raw geometry', () => {
    const geometry = resolveTabOutputGeometry(
      { x: 100, y: 80, width: 300, height: 300 },
      { width: 2560, height: 1440 },
      { width: 1280, height: 720, devicePixelRatio: 2 }
    );
    expect(revalidateTabOutputGeometry(geometry, { width: 2560, height: 1440 })).toBe(true);
    expect(revalidateTabOutputGeometry(geometry, { width: 1920, height: 1080 })).toBe(false);
    expect(
      revalidateTabOutputGeometry(
        geometry,
        { width: 2560, height: 1440 },
        { width: 1024, height: 768, devicePixelRatio: 2 }
      )
    ).toBe(false);
    expect(isSameTabOutputGeometry(geometry, { ...geometry })).toBe(true);
  });

  it('rejects selections outside the CSS viewport', () => {
    expect(() =>
      resolveTabOutputGeometry(
        { x: 1200, y: 0, width: 300, height: 300 },
        { width: 2560, height: 1440 },
        { width: 1280, height: 720, devicePixelRatio: 2 }
      )
    ).toThrow('inside the CSS viewport');
  });

  it('rounds fractional scaled crop boundaries to source pixels', () => {
    expect(
      resolveTabOutputGeometry(
        { x: 1, y: 0, width: 300, height: 300 },
        { width: 1250, height: 750 },
        { width: 1000, height: 600, devicePixelRatio: 1.25 }
      )
    ).toMatchObject({ sourceRect: { x: 1, y: 0, width: 375, height: 375 } });
  });
});
