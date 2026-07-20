import { describe, expect, it, vi } from 'vitest';

import { createEditorToolbarActions } from './actions';

function createActionHarness(
  overrides: Partial<Parameters<typeof createEditorToolbarActions>[0]> = {}
) {
  const controller = {
    cancelCropMode: vi.fn(),
    clearSelection: vi.fn(),
    setActiveTool: vi.fn(),
    suspendToolMode: vi.fn(),
  };
  const setActiveTool = vi.fn();
  const setInspector = vi.fn();

  return {
    controller,
    setActiveTool,
    setInspector,
    actions: createEditorToolbarActions({
      controller,
      hasImage: true,
      inspector: 'tool',
      setActiveTool,
      setInspector,
      ...overrides,
    }),
  };
}

function expectToolActivationOrder(
  harness: ReturnType<typeof createActionHarness>,
  tool: 'rectangle' | 'text'
) {
  expect(harness.setInspector).toHaveBeenCalledWith('tool');
  expect(harness.setActiveTool).toHaveBeenCalledWith(tool);
  expect(harness.controller.clearSelection).toHaveBeenCalledOnce();
  expect(harness.controller.clearSelection.mock.invocationCallOrder[0]).toBeLessThan(
    harness.controller.setActiveTool.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
  expect(harness.controller.setActiveTool).toHaveBeenCalledWith(tool);
}

function registerToolActivationTest() {
  it('activates tools by opening the tool inspector and applying the controller tool', () => {
    const harness = createActionHarness();

    harness.actions.activateTool('rectangle');

    expectToolActivationOrder(harness, 'rectangle');
  });
}

function registerFileInspectorToggleTests() {
  it('opens File by resetting store tool and suspending controller tool mode', () => {
    const harness = createActionHarness();

    harness.actions.toggleInspector('file');

    expect(harness.controller.clearSelection).toHaveBeenCalledOnce();
    expect(harness.setActiveTool).toHaveBeenCalledWith('select');
    expect(harness.controller.suspendToolMode).toHaveBeenCalledOnce();
    expect(harness.controller.setActiveTool).not.toHaveBeenCalled();
    expect(harness.setInspector).toHaveBeenCalledWith('file');
  });

  it('closes File back to tool inspector and restores select mode on repeated click', () => {
    const harness = createActionHarness({ inspector: 'file' });

    harness.actions.toggleInspector('file');

    expect(harness.controller.clearSelection).toHaveBeenCalledOnce();
    expect(harness.setActiveTool).toHaveBeenCalledWith('select');
    expect(harness.controller.suspendToolMode).not.toHaveBeenCalled();
    expect(harness.controller.setActiveTool).toHaveBeenCalledWith('select');
    expect(harness.setInspector).toHaveBeenCalledWith('tool');
  });
}

function registerSelectInspectorTest() {
  it('keeps non-file inspector toggles on select mode', () => {
    const harness = createActionHarness({ inspector: 'frame' });

    harness.actions.toggleInspector('frame');

    expect(harness.controller.clearSelection).toHaveBeenCalledOnce();
    expect(harness.setActiveTool).toHaveBeenCalledWith('select');
    expect(harness.controller.setActiveTool).toHaveBeenCalledWith('select');
    expect(harness.controller.suspendToolMode).not.toHaveBeenCalled();
    expect(harness.setInspector).toHaveBeenCalledWith('tool');
  });
}

function registerResizeInspectorTest() {
  it('opens the combined resize inspector through crop mode and closes it back to select', () => {
    const harness = createActionHarness();

    harness.actions.toggleInspector('canvas-size');

    expect(harness.controller.clearSelection).toHaveBeenCalledOnce();
    expect(harness.setActiveTool).toHaveBeenCalledWith('crop');
    expect(harness.controller.setActiveTool).toHaveBeenCalledWith('crop');
    expect(harness.setInspector).toHaveBeenCalledWith('canvas-size');

    const closingHarness = createActionHarness({ inspector: 'canvas-size' });
    closingHarness.actions.toggleInspector('canvas-size');

    expect(closingHarness.setActiveTool).toHaveBeenCalledWith('select');
    expect(closingHarness.controller.cancelCropMode).toHaveBeenCalledOnce();
    expect(closingHarness.controller.setActiveTool).not.toHaveBeenCalled();
    expect(closingHarness.setInspector).toHaveBeenCalledWith('tool');
  });
}

function registerTextActivationTest() {
  it('activates text through the same single-button flow as other tools', () => {
    const harness = createActionHarness();

    harness.actions.activateTool('text');

    expectToolActivationOrder(harness, 'text');
  });
}

function registerRasterActivationTest() {
  it.each(['selection', 'brush', 'eraser', 'fill'] as const)(
    'preserves the current layer selection when activating the %s raster tool',
    (tool) => {
      const harness = createActionHarness();

      harness.actions.activateTool(tool);

      expect(harness.setInspector).toHaveBeenCalledWith('tool');
      expect(harness.setActiveTool).toHaveBeenCalledWith(tool);
      expect(harness.controller.clearSelection).not.toHaveBeenCalled();
      expect(harness.controller.setActiveTool).toHaveBeenCalledWith(tool);
    }
  );
}

function registerNoImageGuardTest() {
  it('ignores toolbar actions when no image is loaded', () => {
    const harness = createActionHarness({ hasImage: false });

    harness.actions.activateTool('text');
    harness.actions.toggleInspector('file');

    expect(harness.setActiveTool).not.toHaveBeenCalled();
    expect(harness.setInspector).not.toHaveBeenCalled();
    expect(harness.controller.clearSelection).not.toHaveBeenCalled();
    expect(harness.controller.setActiveTool).not.toHaveBeenCalled();
    expect(harness.controller.suspendToolMode).not.toHaveBeenCalled();
  });
}

describe('editor-toolbar.actions', () => {
  registerToolActivationTest();
  registerFileInspectorToggleTests();
  registerSelectInspectorTest();
  registerResizeInspectorTest();
  registerTextActivationTest();
  registerRasterActivationTest();
  registerNoImageGuardTest();
});
