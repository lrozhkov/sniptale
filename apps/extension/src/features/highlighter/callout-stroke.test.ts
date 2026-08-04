import { describe, expect, it } from 'vitest';
import { getCalloutStrokeDasharray } from './callout-stroke';

describe('getCalloutStrokeDasharray', () => {
  it('keeps solid lines continuous and scales dash geometry with line width', () => {
    expect(getCalloutStrokeDasharray('solid', 3)).toBeUndefined();
    expect(getCalloutStrokeDasharray('dashed', 3)).toBe('12 7.5');
    expect(getCalloutStrokeDasharray('dotted', 3)).toBe('0 7.5');
  });

  it('keeps a visible pattern scale for subpixel widths', () => {
    expect(getCalloutStrokeDasharray('dashed', 0.5)).toBe('4 2.5');
  });
});
