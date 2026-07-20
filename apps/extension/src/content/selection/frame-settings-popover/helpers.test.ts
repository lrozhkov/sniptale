// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getFrameSettingsPopoverStyle } from './helpers';

describe('getFrameSettingsPopoverStyle', () => {
  it('keeps the popover hidden until an anchor element exists', () => {
    expect(getFrameSettingsPopoverStyle(null)).toEqual({
      position: 'fixed',
      top: 0,
      left: 0,
      visibility: 'hidden',
      pointerEvents: 'none',
    });
  });
});
