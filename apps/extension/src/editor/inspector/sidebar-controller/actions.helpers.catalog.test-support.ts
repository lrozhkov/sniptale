import { vi } from 'vitest';

export function createTargetArgs(overrides: Record<string, unknown> = {}) {
  return {
    activeTool: 'rectangle',
    selection: {
      hasSelection: false,
      selectedObjectType: null,
    },
    updateArrowSettings: vi.fn(),
    updateLineSettings: vi.fn(),
    updateBlurSettings: vi.fn(),
    updateBrushSettings: vi.fn(),
    updateSelectionArrowSettings: vi.fn(),
    updateSelectionLineSettings: vi.fn(),
    updateSelectionBlurSettings: vi.fn(),
    updateSelectionBrushSettings: vi.fn(),
    updateSelectionShapeSettings: vi.fn(),
    updateSelectionStepSettings: vi.fn(),
    updateSelectionTextSettings: vi.fn(),
    updateShapeSettings: vi.fn(),
    updateStepSettings: vi.fn(),
    updateTextSettings: vi.fn(),
    ...overrides,
  };
}
