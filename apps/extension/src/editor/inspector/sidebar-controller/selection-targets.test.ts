import { describe, expect, it, vi } from 'vitest';
import type { EditorSelectionState } from '../../../features/editor/document/types';
import type { SidebarToolSettingTargetArgs } from './types';
import { resolveToolSettingTargets } from './actions.helpers';

function createSelection(hasSelection: boolean): EditorSelectionState {
  return {
    hasSelection,
    selectedObjectHeight: 0,
    selectedObjectCount: hasSelection ? 1 : 0,
    selectedObjectId: null,
    selectedObjectIds: [],
    selectedObjectType: hasSelection ? 'rectangle' : null,
    selectedObjectWidth: 0,
  };
}

function createTargetArgs(overrides: Partial<SidebarToolSettingTargetArgs> = {}) {
  return {
    activeTool: 'select' as const,
    selection: createSelection(true),
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

function expectSelectionOwnedTargets(args: ReturnType<typeof createTargetArgs>) {
  expect(args.updateSelectionArrowSettings).toHaveBeenCalledOnce();
  expect(args.updateSelectionLineSettings).toHaveBeenCalledOnce();
  expect(args.updateSelectionBrushSettings).toHaveBeenCalledOnce();
  expect(args.updateSelectionShapeSettings).toHaveBeenCalledWith('rectangle', {
    strokeColor: '#333333',
  });
  expect(args.updateSelectionStepSettings).toHaveBeenCalledOnce();
  expect(args.updateSelectionTextSettings).toHaveBeenCalledOnce();
}

describe('editor sidebar selection targets', () => {
  it('prefers selection-owned targets when the active tool is select with an active selection', () => {
    const args = createTargetArgs();
    const targets = resolveToolSettingTargets(args);

    targets.arrow({ color: '#111111' });
    targets.line?.({ width: 5 });
    targets.brush('pencil', { color: '#222222' });
    targets.shape({ strokeColor: '#333333' });
    targets.step({ color: '#444444' });
    targets.text({ fontSize: 18 } as never);
    targets.blur({ amount: 12 });

    expectSelectionOwnedTargets(args);
    expect(args.updateSelectionBlurSettings).toHaveBeenCalledOnce();
  });
});

describe('editor sidebar matched selection targets', () => {
  it('keeps selection-owned targets active when the current tool family matches the selected layer', () => {
    const args = createTargetArgs({
      activeTool: 'rectangle',
      selection: {
        ...createSelection(true),
        selectedObjectType: 'rectangle',
      },
    });
    const targets = resolveToolSettingTargets(args);

    targets.shape({ strokeColor: '#333333' });

    expect(args.updateSelectionShapeSettings).toHaveBeenCalledWith('rectangle', {
      strokeColor: '#333333',
    });
    expect(args.updateShapeSettings).not.toHaveBeenCalled();
  });
});

describe('editor sidebar tool-owned targets', () => {
  it('falls back to tool-owned targets when no selection-owned patch should run', () => {
    const args = createTargetArgs({
      activeTool: 'arrow',
      selection: {
        ...createSelection(true),
        selectedObjectType: 'rectangle',
      },
    });
    const targets = resolveToolSettingTargets(args);

    targets.arrow({ color: '#555555' });
    targets.line?.({ width: 6 });
    targets.brush('highlighter', { color: '#666666' });
    targets.blur({ amount: 14 });
    targets.step({ color: '#888888' });
    targets.text({ fontSize: 20 } as never);

    expect(args.updateArrowSettings).toHaveBeenCalledOnce();
    expect(args.updateLineSettings).toHaveBeenCalledOnce();
    expect(args.updateBrushSettings).toHaveBeenCalledOnce();
    expect(args.updateBlurSettings).toHaveBeenCalledOnce();
    expect(args.updateShapeSettings).not.toHaveBeenCalled();
    expect(args.updateStepSettings).toHaveBeenCalledOnce();
    expect(args.updateTextSettings).toHaveBeenCalledOnce();
  });
});
