import { describe, expect, it, vi } from 'vitest';
import type { EditorTool } from '../../../features/editor/document/types';

import {
  createSelectionSettingsApplier,
  resolveToolSettingTargets,
  shouldShowSelectionToolSettings,
} from './actions.helpers';

function createSelection(
  selectedObjectType:
    | 'ellipse'
    | 'highlighter'
    | 'meta-stamp'
    | 'rich-shape'
    | 'step'
    | 'text'
    | 'transparent-base'
) {
  return {
    hasSelection: true,
    selectedObjectCount: 1,
    selectedObjectHeight: 120,
    selectedObjectId: 'layer-1',
    selectedObjectIds: ['layer-1'],
    selectedObjectType,
    selectedObjectWidth: 160,
  };
}

function createTargets(overrides: Record<string, unknown> = {}) {
  return {
    updateArrowSettings: vi.fn(),
    updateBlurSettings: vi.fn(),
    updateBrushSettings: vi.fn(),
    updateSelectionArrowSettings: vi.fn(),
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

function registerVisibilityRoutingTest() {
  it('shows selection settings only for matching editable owners', () => {
    VISIBILITY_CASES.forEach(({ activeTool, expected, selectedObjectType }) => {
      expectSelectionVisibility(activeTool, selectedObjectType, expected);
    });
    expectSelectionVisibility('text', 'text', false, { hasSelection: false });
    expectSelectionVisibility('select', 'text', false, { selectedObjectLocked: true });
  });
}

const VISIBILITY_CASES = [
  { activeTool: 'text', expected: true, selectedObjectType: 'text' },
  { activeTool: 'arrow', expected: false, selectedObjectType: 'text' },
  { activeTool: 'select', expected: true, selectedObjectType: 'meta-stamp' },
  { activeTool: 'text', expected: false, selectedObjectType: 'transparent-base' },
  { activeTool: 'select', expected: true, selectedObjectType: 'rich-shape' },
  { activeTool: 'rectangle', expected: true, selectedObjectType: 'rich-shape' },
  { activeTool: 'ellipse', expected: false, selectedObjectType: 'rich-shape' },
] as const;

function expectSelectionVisibility(
  activeTool: EditorTool,
  selectedObjectType: Parameters<typeof createSelection>[0],
  expected: boolean,
  selectionOverrides: Record<string, unknown> = {}
) {
  expect(
    shouldShowSelectionToolSettings({
      activeTool,
      selection: { ...createSelection(selectedObjectType), ...selectionOverrides },
    })
  ).toBe(expected);
}

function registerSelectionApplierTest() {
  it('creates selection appliers and routes shape writers by owner', () => {
    const applyActiveSettingsToSelection = vi.fn();
    createSelectionSettingsApplier({
      activeTool: 'text',
      applyActiveSettingsToSelection,
      selection: createSelection('text'),
    })?.();
    expect(applyActiveSettingsToSelection).toHaveBeenCalledOnce();
    expect(
      createSelectionSettingsApplier({
        activeTool: 'blur',
        applyActiveSettingsToSelection,
        selection: createSelection('text'),
      })
    ).toBeNull();
    expect(
      createSelectionSettingsApplier({
        activeTool: 'select',
        applyActiveSettingsToSelection,
        selection: { ...createSelection('text'), selectedObjectLocked: true },
      })
    ).toBeNull();

    const updateSelectionShapeSettings = vi.fn();
    const updateShapeSettings = vi.fn();
    const selectionTargets = resolveToolSettingTargets({
      activeTool: 'select',
      selection: createSelection('ellipse'),
      ...createTargets({
        updateSelectionShapeSettings,
        updateShapeSettings,
      }),
    } as never);
    selectionTargets.shape({ radius: 12 });
    expect(updateSelectionShapeSettings).toHaveBeenCalledWith('ellipse', { radius: 12 });
  });
}

function registerTargetWriterRoutingTest() {
  it('routes active-tool and selection writers through the expected owners', () => {
    const updateArrowSettings = vi.fn();
    const updateTextSettings = vi.fn();
    const activeToolTargets = resolveToolSettingTargets({
      activeTool: 'arrow',
      selection: { ...createSelection('text'), hasSelection: false },
      ...createTargets({
        updateArrowSettings,
        updateTextSettings,
      }),
    } as never);
    activeToolTargets.arrow({ width: 5 });
    activeToolTargets.text({ textAlign: 'center' });
    expect(updateArrowSettings).toHaveBeenCalledWith({ width: 5 });
    expect(updateTextSettings).toHaveBeenCalledWith({ textAlign: 'center' });

    const updateSelectionBlurSettings = vi.fn();
    const updateSelectionBrushSettings = vi.fn();
    const updateSelectionStepSettings = vi.fn();
    const updateShapeSettings = vi.fn();
    const selectionTargets = resolveToolSettingTargets({
      activeTool: 'select',
      selection: createSelection('highlighter'),
      ...createTargets({
        updateSelectionBlurSettings,
        updateSelectionBrushSettings,
        updateSelectionStepSettings,
        updateShapeSettings,
      }),
    } as never);
    selectionTargets.brush('highlighter', { width: 9 });
    selectionTargets.blur({ amount: 12 });
    selectionTargets.step({ value: '2' });
    selectionTargets.shape({ radius: 6 });
    expect(updateSelectionBrushSettings).toHaveBeenCalledWith('highlighter', { width: 9 });
    expect(updateSelectionBlurSettings).toHaveBeenCalledWith({ amount: 12 });
    expect(updateSelectionStepSettings).toHaveBeenCalledWith({ value: '2' });
    expect(updateShapeSettings).not.toHaveBeenCalled();
  });
}

describe('editor sidebar action helper selection routing', () => {
  registerVisibilityRoutingTest();
  registerSelectionApplierTest();
  registerTargetWriterRoutingTest();
});
