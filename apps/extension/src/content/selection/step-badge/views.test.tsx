import { expect, it } from 'vitest';
import {
  getStepBadgeStyle as getSharedStepBadgeStyle,
  StepBadgeValue as SharedStepBadgeValue,
} from '../../../features/highlighter/frame-annotation/step-badge-surface';
import {
  getStepBadgeStyle,
  StepBadgeValue,
} from '../../../features/highlighter/frame-annotation/step-badge-surface';

it('keeps page badge visuals identical to the shared frame surface', () => {
  expect(getStepBadgeStyle).toBe(getSharedStepBadgeStyle);
  expect(StepBadgeValue).toBe(SharedStepBadgeValue);
});
