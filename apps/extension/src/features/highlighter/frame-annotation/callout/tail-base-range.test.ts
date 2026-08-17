import { describe, expect, it } from 'vitest';
import { getShiftedCalloutTailBaseRange } from './tail-base-range';

describe('getShiftedCalloutTailBaseRange', () => {
  it('moves both wedge base points together while preserving their width', () => {
    expect(getShiftedCalloutTailBaseRange(0.7, 0.2)).toEqual({ position: 0.7, width: 0.2 });
    expect(getShiftedCalloutTailBaseRange(0.98, 0.2)).toEqual({ position: 0.9, width: 0.2 });
    expect(getShiftedCalloutTailBaseRange(0.01, 0.2)).toEqual({ position: 0.1, width: 0.2 });
  });
});
