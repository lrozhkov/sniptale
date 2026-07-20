import { describe, expect, it, vi } from 'vitest';
import {
  buildBorderPresetOptions,
  createSelectionSettingsApplier,
  createStaticSidebarOptions,
  resolveToolSettingTargets,
  shouldShowSelectionToolSettings,
} from './actions.helpers';
import type { SidebarToolSettingTargetArgs } from './types';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import type { EditorSelectionState } from '../../../features/editor/document/types';

function createSelection(
  selectedObjectType: NonNullable<SidebarToolSettingTargetArgs['selection']['selectedObjectType']>,
  hasSelection = true
): EditorSelectionState {
  const baseSelection = createInspectorCommandParams().selection as EditorSelectionState;

  return {
    ...baseSelection,
    hasSelection,
    selectedObjectType: selectedObjectType as EditorSelectionState['selectedObjectType'],
  };
}

function createTargetArgs(
  overrides: Partial<SidebarToolSettingTargetArgs> = {}
): SidebarToolSettingTargetArgs {
  const params = createInspectorCommandParams();
  return {
    activeTool: 'select',
    selection: params.selection as EditorSelectionState,
    updateArrowSettings: vi.fn(),
    updateBlurSettings: vi.fn(),
    updateBrushSettings: vi.fn(),
    updateImageSettings: vi.fn(),
    updateSelectionArrowSettings: vi.fn(),
    updateSelectionBlurSettings: vi.fn(),
    updateSelectionBrushSettings: vi.fn(),
    updateSelectionImageSettings: vi.fn(),
    updateSelectionShapeSettings: vi.fn(),
    updateSelectionStepSettings: vi.fn(),
    updateSelectionTextSettings: vi.fn(),
    updateShapeSettings: vi.fn(),
    updateStepSettings: vi.fn(),
    updateTextSettings: vi.fn(),
    ...overrides,
  };
}

function registerArrowOwnerVisibilityTests() {
  it.each([
    ['arrow', true],
    ['blur', false],
    ['pencil', false],
    ['highlighter', false],
    ['rough-shape', false],
    ['selection', false],
    ['eraser', false],
    ['fill', false],
    ['select', true],
    ['image', false],
    ['callout', false],
    ['crop', false],
  ] as const)(
    'shows selection settings for an arrow selection only when %s owns the same settings',
    (activeTool, expected) => {
      expect(
        shouldShowSelectionToolSettings({
          activeTool,
          selection: createSelection('arrow'),
        })
      ).toBe(expected);
    }
  );
}

function registerSelectionOwnerTests() {
  it.each([
    ['pencil', true],
    ['highlighter', true],
    ['rectangle', true],
    ['diamond', true],
    ['ellipse', true],
    ['blur', true],
    ['arrow', true],
    ['text', true],
    ['meta-stamp', true],
    ['step', true],
    ['image', true],
    ['source-image', true],
    ['background', true],
    ['browser-frame', false],
  ] as const)(
    'treats %s selection ownership correctly for the select tool',
    (selectedObjectType, expected) => {
      expect(
        shouldShowSelectionToolSettings({
          activeTool: 'select',
          selection: createSelection(selectedObjectType),
        })
      ).toBe(expected);
    }
  );
}

function registerSelectionApplierTest() {
  it('creates an applier only when the current tool can write back into selection-owned settings', () => {
    const applyActiveSettingsToSelection = vi.fn();

    expect(
      createSelectionSettingsApplier({
        activeTool: 'fill',
        applyActiveSettingsToSelection,
        selection: createSelection('arrow'),
      })
    ).toBeNull();

    const apply = createSelectionSettingsApplier({
      activeTool: 'select',
      applyActiveSettingsToSelection,
      selection: createSelection('text'),
    });

    expect(apply).not.toBeNull();
    apply?.();
    expect(applyActiveSettingsToSelection).toHaveBeenCalledOnce();
    expect(
      createSelectionSettingsApplier({
        activeTool: 'select',
        applyActiveSettingsToSelection,
        selection: { ...createSelection('text'), selectedObjectLocked: true },
      })
    ).toBeNull();
  });
}

function registerBorderPresetOptionsTest() {
  it('filters disabled border presets out of selector options', () => {
    expect(
      buildBorderPresetOptions([
        { enabled: true, id: 'preset-a', name: 'Preset A' } as never,
        { enabled: false, id: 'preset-b', name: 'Preset B' } as never,
      ])
    ).toEqual([{ label: 'Preset A', value: 'preset-a' }]);
  });
}

function registerSelectionOwnedTargetRoutingTest() {
  it('routes shape and text updates through selection-owned handlers when selection settings are active', () => {
    const args = createTargetArgs({
      activeTool: 'select',
      selection: createSelection('ellipse'),
    });
    const targets = resolveToolSettingTargets(args);

    targets.arrow({ mode: 'straight' });
    targets.blur({ blurType: 'pixelate' });
    targets.brush('pencil', { color: '#111111' });
    targets.shape({ fillColor: '#ffffff' });
    targets.step({ type: 'number' });
    targets.text({ textColor: '#000000' });
    targets.image?.({ opacity: 0.5 });

    expect(args.updateSelectionArrowSettings).toHaveBeenCalledWith({ mode: 'straight' });
    expect(args.updateSelectionBlurSettings).toHaveBeenCalledWith({ blurType: 'pixelate' });
    expect(args.updateSelectionBrushSettings).toHaveBeenCalledWith('pencil', {
      color: '#111111',
    });
    expect(args.updateSelectionShapeSettings).toHaveBeenCalledWith('ellipse', {
      fillColor: '#ffffff',
    });
    expect(args.updateSelectionStepSettings).toHaveBeenCalledWith({ type: 'number' });
    expect(args.updateSelectionTextSettings).toHaveBeenCalledWith({ textColor: '#000000' });
    expect(args.updateSelectionImageSettings).toHaveBeenCalledWith({ opacity: 0.5 });
  });

  it.each(['source-image', 'background'] as const)(
    'routes %s image style updates through selection-owned image handlers',
    (selectedObjectType) => {
      const args = createTargetArgs({
        activeTool: 'select',
        selection: createSelection(selectedObjectType),
      });
      const targets = resolveToolSettingTargets(args);

      targets.image?.({ opacity: 0.5 });

      expect(args.updateSelectionImageSettings).toHaveBeenCalledWith({ opacity: 0.5 });
      expect(args.updateImageSettings).not.toHaveBeenCalled();
    }
  );
}

function registerActiveToolTargetRoutingTest() {
  it('routes active-tool updates through non-selection handlers and ignores shape patches for non-shape tools', () => {
    const rectangleArgs = createTargetArgs({
      activeTool: 'rectangle',
      selection: createSelection('rectangle', false),
    });
    const rectangleTargets = resolveToolSettingTargets(rectangleArgs);
    rectangleTargets.shape({ strokeColor: '#123456' });
    rectangleTargets.image?.({ opacity: 0.75 });

    expect(rectangleArgs.updateShapeSettings).toHaveBeenCalledWith('rectangle', {
      strokeColor: '#123456',
    });
    expect(rectangleArgs.updateImageSettings).toHaveBeenCalledWith({ opacity: 0.75 });

    const blurArgs = createTargetArgs({
      activeTool: 'blur',
      selection: createSelection('rectangle', false),
    });
    resolveToolSettingTargets(blurArgs).shape({ strokeColor: '#654321' });

    expect(blurArgs.updateShapeSettings).not.toHaveBeenCalled();
  });
}

function registerStaticOptionsTest() {
  it('publishes only the surviving browser-frame static options', () => {
    expect(createStaticSidebarOptions()).toEqual(
      expect.objectContaining({
        browserCanvasModeOptions: expect.any(Array),
        browserContentModeOptions: expect.any(Array),
        clampGridSize: expect.any(Function),
        frameGradientPresets: expect.any(Array),
        workspaceBackgroundPalette: expect.any(Array),
      })
    );
    expect(createStaticSidebarOptions()).not.toHaveProperty('browserVariantOptions');
    expect(createStaticSidebarOptions()).not.toHaveProperty('browserThemeOptions');
    expect(createStaticSidebarOptions()).not.toHaveProperty('browserModeOptions');
  });
}

describe('sidebar-controller actions helpers', () => {
  registerArrowOwnerVisibilityTests();
  registerSelectionOwnerTests();
  registerSelectionApplierTest();
  registerBorderPresetOptionsTest();
  registerSelectionOwnedTargetRoutingTest();
  registerActiveToolTargetRoutingTest();
  registerStaticOptionsTest();
});
