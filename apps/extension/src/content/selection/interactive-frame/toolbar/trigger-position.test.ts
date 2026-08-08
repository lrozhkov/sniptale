// @vitest-environment jsdom

import { expect, it } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { canFitFrameQuickActions, getFrameTriggerPosition } from './trigger-position';

const frame = {
  id: 'frame-zoom',
  x: 100,
  y: 100,
  width: 100,
  height: 100,
} as FrameData;

it('uses compensated visual control dimensions for frame-edge actions', () => {
  expect(canFitFrameQuickActions(frame, 4, 0.5)).toBe(true);

  const position = getFrameTriggerPosition(frame, 4, 0.5);
  expect(position).toMatchObject({
    direction: 'row',
    height: 13,
    width: 58,
    y: 93.5,
  });
});
