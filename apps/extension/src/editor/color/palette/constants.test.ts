import { describe, expect, it } from 'vitest';

import {
  EDITOR_BROWSER_FRAME_MAC_TRAFFIC_LIGHTS,
  EDITOR_BROWSER_FRAME_WINDOWS_DARK,
  EDITOR_CANVAS_ACCENT,
  EDITOR_CANVAS_CROP_OVERLAY,
} from './constants';

describe('palette constants', () => {
  it('keeps editor accent and crop overlay values stable', () => {
    expect(EDITOR_CANVAS_ACCENT).toBe('#f97316');
    expect(EDITOR_CANVAS_CROP_OVERLAY).toContain('rgba(');
  });

  it('keeps browser frame palette shapes intact', () => {
    expect(EDITOR_BROWSER_FRAME_WINDOWS_DARK.addressBg).toBe('#27272a');
    expect(EDITOR_BROWSER_FRAME_MAC_TRAFFIC_LIGHTS).toHaveLength(3);
  });
});
