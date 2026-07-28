import { describe, expect, it } from 'vitest';
import { buildViewportEmulationResult } from './helpers';

describe('exact debugger workspace helpers', () => {
  it('parses evaluated window viewport dimensions', () => {
    expect(
      buildViewportEmulationResult({
        width: 1280,
        height: 720,
      })
    ).toEqual({ cssWidth: 1280, cssHeight: 720 });
  });

  it('rejects missing, non-integer, and non-positive dimensions', () => {
    expect(() => buildViewportEmulationResult({})).toThrow('window.innerWidth');
    expect(() => buildViewportEmulationResult({ width: 1280.5, height: 720 })).toThrow(
      'window.innerWidth'
    );
    expect(() => buildViewportEmulationResult({ width: 1280, height: 0 })).toThrow(
      'window.innerWidth'
    );
  });
});
