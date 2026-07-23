// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { constrainSelection } from '.';

describe('selection-mode interactions seam', () => {
  it('re-exports frame helpers through the canonical interactions owner', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { innerWidth: 300, innerHeight: 200 },
    });

    expect(constrainSelection({ x: 280, y: -10, width: 40, height: 50 })).toEqual({
      x: 260,
      y: 0,
      width: 40,
      height: 50,
    });
  });
});
