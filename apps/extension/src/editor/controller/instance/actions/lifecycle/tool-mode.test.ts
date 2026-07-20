import { expect, it, vi } from 'vitest';

import {
  clearSelectionForController,
  setActiveToolForController,
  suspendToolModeForController,
} from './tool-mode';

it('clears active selection without changing the active tool', () => {
  const controller = {
    activeTool: 'rectangle',
    canvas: {
      discardActiveObject: vi.fn(),
      getActiveObjects: () => [{ id: 'layer-1' }],
      requestRenderAll: vi.fn(),
    },
    syncRuntimeState: vi.fn(),
    toolModeEnabled: true,
  };

  clearSelectionForController(controller as never);

  expect(controller.canvas.discardActiveObject).toHaveBeenCalledOnce();
  expect(controller.canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  expect(controller.activeTool).toBe('rectangle');
});

it('sets and suspends tool mode through minimal controller state', () => {
  const controller = {
    activeTool: 'eraser',
    applyToolMode: vi.fn(),
    canvas: { getActiveObjects: () => [] },
    syncRuntimeState: vi.fn(),
    toolModeEnabled: false,
  };

  setActiveToolForController(controller as never, 'text');
  suspendToolModeForController(controller as never);

  expect(controller.activeTool).toBe('select');
  expect(controller.toolModeEnabled).toBe(false);
  expect(controller.syncRuntimeState).toHaveBeenCalledTimes(2);
  expect(controller.applyToolMode).toHaveBeenCalledOnce();
});
