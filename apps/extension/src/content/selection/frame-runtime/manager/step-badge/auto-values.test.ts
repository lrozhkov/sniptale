// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { FrameData } from '../../../../../features/highlighter/contracts';
import { applyAutoStepBadgeValues } from './auto-values';
import { createFrameDataFixture, createStepBadgeSettingsFixture } from '../../test-support';

function createFrame(
  id: string,
  index: number,
  stepBadge?: Partial<NonNullable<FrameData['stepBadge']>>
): FrameData {
  return createFrameDataFixture(id, {
    ...(stepBadge ? { stepBadge: createStepBadgeSettingsFixture(stepBadge) } : {}),
    y: 20 + index * 10,
  });
}

describe('frame-manager-step-badge-auto-values', () => {
  it('applies auto-generated badge values by grouped ordering and skips excluded/manual frames', () => {
    const frames = [
      createFrame('a', 0, { type: 'number' }),
      createFrame('b', 1, { type: 'number' }),
      createFrame('c', 2, { type: 'letter', alphabet: 'latin' }),
      createFrame('d', 3, { type: 'number', auto: false, value: 'manual' }),
    ];
    const result = applyAutoStepBadgeValues(
      frames,
      new Map([
        ['b', 0],
        ['a', 1],
      ]),
      'c'
    );

    expect(result.find((frame) => frame.id === 'a')?.stepBadge?.value).toBe('2');
    expect(result.find((frame) => frame.id === 'b')?.stepBadge?.value).toBe('1');
    expect(result.find((frame) => frame.id === 'c')?.stepBadge?.value).toBe('');
    expect(result.find((frame) => frame.id === 'd')?.stepBadge?.value).toBe('manual');
  });

  it('returns the original frame array when there are no auto-enabled badge frames', () => {
    const frames = [createFrame('manual', 0, { auto: false, value: 'M' }), createFrame('none', 1)];

    expect(applyAutoStepBadgeValues(frames, new Map())).toBe(frames);
  });
});
