import { expect, it, vi } from 'vitest';
import { createDrawingEventHandlers } from './handlers';
import { isSecondaryButton } from './secondary-button';

function createBindings() {
  return {
    getCanvas: vi.fn(() => null),
    getSource: vi.fn(() => null),
    getActiveTool: vi.fn(() => 'select'),
  } as never;
}

it('owns drawing handler registration shape and secondary-button guard', () => {
  expect(Object.keys(createDrawingEventHandlers(createBindings())).sort()).toEqual([
    'handleMouseDown',
    'handleMouseDownBefore',
    'handleMouseMove',
    'handleMouseUp',
    'handlePathCreated',
  ]);
  expect(isSecondaryButton({ button: 2 } as never)).toBe(true);
  expect(isSecondaryButton({ which: 3 } as never)).toBe(true);
  expect(isSecondaryButton({ button: 0 } as never)).toBe(false);
});
