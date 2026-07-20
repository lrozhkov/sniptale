import { vi } from 'vitest';

export function createDrawingBindings() {
  return {
    addObject: vi.fn(),
    advanceStepValue: vi.fn(),
    decorateShape: vi.fn(),
    nextLabelIndex: vi.fn(() => 4),
    prepareObject: vi.fn(),
    startDrawSession: vi.fn(),
    switchToSelectTool: vi.fn(),
  };
}
