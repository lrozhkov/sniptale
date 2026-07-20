import { describe, expect, it, vi } from 'vitest';

import { createSelectionModeSetupListenerHandlers } from './listeners';

describe('selection-mode runtime-state listener handlers', () => {
  it('returns the same listener functions without altering ownership', () => {
    const handlers = {
      handleClick: vi.fn(),
      handleKeyDown: vi.fn(),
      handleMouseDown: vi.fn(),
      handleMouseLeave: vi.fn(),
      handleMouseMove: vi.fn(),
      handleMouseUp: vi.fn(),
    };

    expect(createSelectionModeSetupListenerHandlers(handlers)).toStrictEqual(handlers);
  });
});
