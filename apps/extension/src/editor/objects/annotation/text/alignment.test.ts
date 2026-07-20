import { describe, expect, it, vi } from 'vitest';

import { attachTextCalloutAlignment } from './alignment';
import { getTextCalloutContentRect, getTextCalloutSurfaceSize } from './geometry';

function createTextbox(overrides: Record<string, unknown> = {}) {
  return {
    _getLeftOffset: vi.fn(() => 11),
    _getTopOffset: vi.fn(() => 13),
    fontSize: 16,
    height: 48,
    sniptaleTextCalloutFormat: 'pointer',
    sniptaleTextCalloutHeight: 120,
    sniptaleTextCalloutWidth: 240,
    sniptaleTextLayoutMode: 'fixed-width',
    sniptaleTextVerticalAlign: 'bottom',
    padding: 10,
    width: 140,
    ...overrides,
  };
}

describe('text callout alignment', () => {
  it('reanchors non-plain textboxes to the body content rect', () => {
    const textbox = createTextbox();
    const surface = getTextCalloutSurfaceSize(textbox as never, 'pointer');
    const content = getTextCalloutContentRect(surface, textbox as never, 'pointer');

    attachTextCalloutAlignment(textbox as never);

    expect(textbox._getLeftOffset()).toBe(-surface.width / 2 + content.left);
    expect(textbox._getTopOffset()).toBe(-surface.height / 2 + content.top);
    expect(
      (textbox as { sniptaleTextCalloutAlignmentAttached?: boolean })
        .sniptaleTextCalloutAlignmentAttached
    ).toBe(true);
  });

  it('aligns plain textboxes inside the stored fixed-height box', () => {
    const textbox = createTextbox({
      height: 40,
      sniptaleTextCalloutFormat: 'plain',
      sniptaleTextCalloutHeight: 120,
      sniptaleTextCalloutWidth: 240,
      sniptaleTextVerticalAlign: 'bottom',
      padding: 0,
      width: 120,
    });

    attachTextCalloutAlignment(textbox as never);

    expect(textbox._getLeftOffset()).toBe(-120);
    expect(textbox._getTopOffset()).toBe(20);
  });
});
