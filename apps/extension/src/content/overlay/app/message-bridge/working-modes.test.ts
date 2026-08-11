import { describe, expect, it, vi } from 'vitest';
import type { UseToolbarModeControllerResult } from '../../toolbar/mode-controller/types';
import { selectToolbarWorkingMode } from './working-modes';

function createModeController(): UseToolbarModeControllerResult {
  return {
    handleClearHighlights: vi.fn(),
    handleEnableCursorMode: vi.fn(() => true),
    handleHideToolbar: vi.fn(),
    handleToggleDesignReviewMode: vi.fn(),
    handleToggleDrawingMode: vi.fn(),
    handleToggleHighlighterMode: vi.fn(),
    handleToggleNavigationLock: vi.fn(),
    handleToggleQuickEditDocumentMode: vi.fn(),
    handleToggleQuickEditMode: vi.fn(),
    handleToggleScreenshotMode: vi.fn(),
  };
}

describe('selectToolbarWorkingMode', () => {
  it.each([
    ['cursor', 'handleEnableCursorMode'],
    ['drawing', 'handleToggleDrawingMode'],
    ['highlighter', 'handleToggleHighlighterMode'],
    ['quick-edit', 'handleToggleQuickEditMode'],
    ['design-review', 'handleToggleDesignReviewMode'],
  ] as const)('selects %s through the toolbar mode controller', (mode, method) => {
    const controller = createModeController();

    selectToolbarWorkingMode(controller, mode);

    expect(controller[method]).toHaveBeenCalledWith(...(mode === 'cursor' ? [] : [true]));
  });

  it('tolerates a surface without drawing support', () => {
    const controller = createModeController();
    delete controller.handleToggleDrawingMode;

    expect(() => selectToolbarWorkingMode(controller, 'drawing')).not.toThrow();
  });
});
