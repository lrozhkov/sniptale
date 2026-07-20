import { describe, expect, it } from 'vitest';

import { getTextCalloutDimensions } from './callout';

describe('text callout surface sizing', () => {
  it('keeps plain text surfaces mapped to the textbox box without callout padding', () => {
    const textbox = {
      height: 40,
      sniptaleTextCalloutFormat: 'plain',
      padding: 0,
      width: 90,
    };

    expect(getTextCalloutDimensions(textbox as never)).toEqual({ height: 40, width: 90 });
  });
});
