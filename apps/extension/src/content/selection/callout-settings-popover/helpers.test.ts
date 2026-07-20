// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getCalloutSettingsPopoverStyle } from './helpers';

describe('getCalloutSettingsPopoverStyle', () => {
  it('keeps the popover hidden until an anchor element exists', () => {
    expect(getCalloutSettingsPopoverStyle(null)).toEqual({
      position: 'fixed',
      top: 0,
      left: 0,
      visibility: 'hidden',
      pointerEvents: 'none',
    });
  });
});
