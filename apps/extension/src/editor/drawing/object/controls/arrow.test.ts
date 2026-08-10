import { expect, it } from 'vitest';
import { createDrawingArrowControls } from './arrow';

it('provides exactly two grab endpoints for drawing arrows', () => {
  const controls = createDrawingArrowControls();

  expect(Object.keys(controls)).toEqual(['start', 'end']);
  expect(controls['start']?.cursorStyle).toBe('grab');
  expect(controls['end']?.cursorStyle).toBe('grab');
});
