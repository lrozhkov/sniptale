import { describe, expect, it } from 'vitest';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { getSortedFramesWithZIndex } from './layering';

function frame(id: string, width: number, height: number): FrameData {
  return { effectMode: 'border', height, id, width, x: 0, y: 0 };
}

describe('frame visual layering', () => {
  it('keeps hover and selection chrome from lifting the annotation itself', () => {
    const outer = frame('outer', 400, 300);
    const inner = frame('inner', 120, 80);
    const states = new Map<string, FrameState>([['outer', 'hover']]);
    const result = getSortedFramesWithZIndex([outer, inner], states);

    expect(result.find(({ id }) => id === 'inner')?.zIndex).toBeGreaterThan(
      result.find(({ id }) => id === 'outer')?.zIndex ?? 0
    );
  });

  it('raises only the frame under direct manipulation', () => {
    const outer = frame('outer', 400, 300);
    const inner = frame('inner', 120, 80);
    const states = new Map<string, FrameState>([['outer', 'resizing']]);
    const result = getSortedFramesWithZIndex([outer, inner], states);

    expect(result.find(({ id }) => id === 'outer')?.zIndex).toBeGreaterThan(
      result.find(({ id }) => id === 'inner')?.zIndex ?? 0
    );
  });

  it('places the last-added frame above a fully coincident predecessor', () => {
    const first = frame('first', 200, 120);
    const last = frame('last', 200, 120);
    const result = getSortedFramesWithZIndex([first, last], new Map());

    expect(result.find(({ id }) => id === 'last')?.zIndex).toBeGreaterThan(
      result.find(({ id }) => id === 'first')?.zIndex ?? 0
    );
  });
});
