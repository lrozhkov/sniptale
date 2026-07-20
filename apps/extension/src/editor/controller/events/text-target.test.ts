import { describe, expect, it, vi } from 'vitest';

import { activateTextTarget, isTextTarget } from './text-target';

function runTextTargetDetectionSuite() {
  it('detects editor text and legacy meta-stamp textboxes only', () => {
    expect(isTextTarget({ sniptaleType: 'text', type: 'textbox' } as never)).toBe(true);
    expect(isTextTarget({ sniptaleType: 'meta-stamp', type: 'textbox' } as never)).toBe(true);
    expect(isTextTarget({ sniptaleType: 'text', type: 'rect' } as never)).toBe(false);
    expect(isTextTarget({ sniptaleType: 'image', type: 'textbox' } as never)).toBe(false);
  });
}

function runTextTargetActivationSuite() {
  it('switches editing to a different text target and syncs runtime', () => {
    const activeObject = {
      exitEditing: vi.fn(),
      isEditing: true,
    };
    const pointerEvent = { kind: 'pointer' };
    const target = {
      enterEditing: vi.fn(),
      isEditing: false,
      selectAll: vi.fn(),
    };
    const canvas = {
      getActiveObject: vi.fn(() => activeObject),
      requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(),
    };
    const syncRuntimeState = vi.fn();

    activateTextTarget(canvas as never, target as never, syncRuntimeState, {
      event: pointerEvent as never,
    });

    expect(activeObject.exitEditing).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledWith(target, pointerEvent);
    expect(target.enterEditing).toHaveBeenCalledOnce();
    expect(target.selectAll).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function runExistingTargetSuite() {
  it('keeps the current editing target active without re-entering edit mode', () => {
    const target = {
      enterEditing: vi.fn(),
      isEditing: true,
      selectAll: vi.fn(),
    };
    const canvas = {
      getActiveObject: vi.fn(() => target),
      requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(),
    };
    const syncRuntimeState = vi.fn();

    activateTextTarget(canvas as never, target as never, syncRuntimeState);

    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(target.enterEditing).not.toHaveBeenCalled();
    expect(target.selectAll).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('can enter editing without selecting the whole text payload', () => {
    const target = {
      enterEditing: vi.fn(),
      isEditing: false,
      selectAll: vi.fn(),
    };
    const canvas = {
      getActiveObject: vi.fn(() => null),
      requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(),
    };

    activateTextTarget(canvas as never, target as never, vi.fn(), {
      selectAll: false,
    });

    expect(target.enterEditing).toHaveBeenCalledOnce();
    expect(target.selectAll).not.toHaveBeenCalled();
  });
}

describe('editor-controller-events text target helpers', () => {
  runTextTargetDetectionSuite();
  runTextTargetActivationSuite();
  runExistingTargetSuite();
});
