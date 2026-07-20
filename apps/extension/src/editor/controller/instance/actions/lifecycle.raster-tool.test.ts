// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { setActiveToolForController } from './lifecycle';

describe('editor controller lifecycle raster tool activation', () => {
  it('refreshes runtime target state before applying a newly selected raster tool', () => {
    const controller = {
      activeTool: 'select',
      applyToolMode: vi.fn(),
      syncRuntimeState: vi.fn(),
      toolModeEnabled: false,
    };

    setActiveToolForController(controller as never, 'eraser');

    expect(controller.activeTool).toBe('eraser');
    expect(controller.toolModeEnabled).toBe(true);
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
    expect(controller.applyToolMode).not.toHaveBeenCalled();
  });
});
