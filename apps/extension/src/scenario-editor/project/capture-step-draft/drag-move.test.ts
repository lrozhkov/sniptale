import { expect, it } from 'vitest';
import { didScenarioDragMove } from './drag-move';

it('returns false when pointer coordinates did not change', () => {
  expect(didScenarioDragMove({ x: 10, y: 20 }, { clientX: 10, clientY: 20 } as PointerEvent)).toBe(
    false
  );
});

it('returns true when either pointer axis changed', () => {
  expect(didScenarioDragMove({ x: 10, y: 20 }, { clientX: 14, clientY: 20 } as PointerEvent)).toBe(
    true
  );
  expect(didScenarioDragMove({ x: 10, y: 20 }, { clientX: 10, clientY: 25 } as PointerEvent)).toBe(
    true
  );
});
