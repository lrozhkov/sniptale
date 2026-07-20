import { describe, expect, it, vi } from 'vitest';
import type { EditorTool } from '../../../features/editor/document/types';

import {
  buildBorderPresetOptions,
  buildSidebarUtilityActions,
  createStaticSidebarOptions,
  createSelectionSettingsApplier,
  resolveToolSettingTargets,
  shouldShowSelectionToolSettings,
} from './actions.helpers';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createTargetArgs } from './actions.helpers.catalog.test-support';

function registerCatalogOptionsTest() {
  it('exposes the simplified arrow and text option catalogs', () => {
    const options = createStaticSidebarOptions();

    expectArrowOptionCatalog(options);
    expectLineOptionCatalog(options);
    expectTextOptionCatalog(options);
    expect(options.gridSizeMin).toBeGreaterThan(0);
    expect(options.gridSizeMax).toBeGreaterThan(options.gridSizeMin);
    expect(options.workspaceBackgroundPalette.length).toBeGreaterThan(0);
    expect(
      buildBorderPresetOptions([
        { ...DEFAULT_BORDER_PRESET, id: 'hidden', name: 'Hidden', enabled: false },
        { ...DEFAULT_BORDER_PRESET, id: 'visible', name: 'Visible', enabled: true },
      ])
    ).toEqual([{ label: 'Visible', value: 'visible' }]);
  });
}

function expectArrowOptionCatalog(options: ReturnType<typeof createStaticSidebarOptions>) {
  expect(options.arrowVariantOptions.map((option) => option.value)).toEqual([
    'standard',
    'tapered',
  ]);
  expect(options.arrowModeOptions.map((option) => option.value)).toEqual(['straight', 'curve']);
  expect(options.arrowTypeOptions.map((option) => option.value)).toEqual([
    'sharp',
    'curved',
    'elbow',
  ]);
  expect(options.arrowHeadOptions.map((option) => option.value)).toEqual([
    'none',
    'arrow',
    'triangle',
    'triangle-outline',
    'bar',
    'circle',
    'circle-outline',
    'diamond',
    'diamond-outline',
    'block',
  ]);
}

function expectLineOptionCatalog(options: ReturnType<typeof createStaticSidebarOptions>) {
  expect(options.lineStyleOptions.map((option) => option.value)).toEqual([
    'solid',
    'dash',
    'dot',
    'dash-dot',
    'long-dash',
  ]);
  expect(options.lineCornerOptions.map((option) => option.value)).toEqual(['round', 'sharp']);
  expect(options.lineFillModeOptions.map((option) => option.value)).toEqual([
    'none',
    'color',
    'gradient',
    'rough',
  ]);
  expect(options.lineRoughFillStyleOptions.map((option) => option.value)).toContain('hachure');
}

function expectTextOptionCatalog(options: ReturnType<typeof createStaticSidebarOptions>) {
  expect(options.textLayoutModeOptions.map((option) => option.value)).toEqual([
    'auto',
    'fixed-width',
  ]);
  expect(options.textAlignOptions.map((option) => option.value)).toEqual([
    'left',
    'center',
    'right',
  ]);
  expect(options.textVerticalAlignOptions.map((option) => option.value)).toEqual([
    'top',
    'center',
    'bottom',
  ]);
}

function createUtilityActionArgs() {
  const withHistoryMutedCall = vi.fn();
  const withHistoryMuted = <T>(callback: () => T): T => {
    withHistoryMutedCall();
    return callback();
  };
  const rememberRecentColor = vi.fn(async () => undefined);
  const setter = vi.fn();
  const args = {
    borderPresets: [DEFAULT_BORDER_PRESET],
    controller: {
      exportDocument: vi.fn(),
      previewActiveSettingsOnSelection: vi.fn(),
      refreshActiveToolSettingsPreview: vi.fn(),
      renderToDataUrl: vi.fn(() => 'data:image/png;base64,rendered'),
      withHistoryMuted,
    },
    confirmOpenStorageManager: vi.fn(async () => false),
    defaultImagePresetId: 'preset-default',
    hasImage: true,
    rememberRecentColor,
    savePresets: [],
    setFrameDraft: vi.fn(),
    syncBrowserFrame: vi.fn(async () => undefined),
    targets: {
      arrow: vi.fn(),
      brush: vi.fn(),
      blur: vi.fn(),
      shape: vi.fn(),
      step: vi.fn(),
      text: vi.fn(),
    },
  };
  return { args, rememberRecentColor, setter, withHistoryMutedCall };
}

function expectSelectionSettingsVisibility(activeTool: EditorTool, expected: boolean) {
  expect(
    shouldShowSelectionToolSettings({
      activeTool,
      selection: {
        hasSelection: true,
        selectedObjectCount: 1,
        selectedObjectType: 'rich-shape',
      } as never,
    })
  ).toBe(expected);
}

function registerPreviewUtilityTest() {
  it('routes preview color updates through withHistoryMuted before the setter', () => {
    const { args, rememberRecentColor, setter, withHistoryMutedCall } = createUtilityActionArgs();
    const utilityActions = buildSidebarUtilityActions(args);

    utilityActions.previewColor(setter, '#123456');
    utilityActions.updateColor(setter, '#654321');
    utilityActions.setUniformPadding(9.4);

    expect(withHistoryMutedCall).toHaveBeenCalledOnce();
    expect(setter).toHaveBeenNthCalledWith(1, '#123456');
    expect(setter).toHaveBeenNthCalledWith(2, '#654321');
    expect(rememberRecentColor).toHaveBeenCalledWith('#654321');
    expect(args.setFrameDraft).toHaveBeenCalledWith(expect.any(Function));
    expect(utilityActions.toNumber('7', 0)).toBe(7);
    expectSelectionSettingsVisibility('rectangle', true);
    expectSelectionSettingsVisibility('brush', false);
    expectSelectionSettingsVisibility('shape-library', false);
    expectSelectionSettingsVisibility('shapes-and-lines', false);
  });
}

function expectActiveShapeTarget() {
  const activeArgs = createTargetArgs();
  resolveToolSettingTargets(activeArgs as never).shape({ strokeWidth: 4 });
  expect(activeArgs.updateShapeSettings).toHaveBeenCalledWith('rectangle', { strokeWidth: 4 });

  const ellipseArgs = createTargetArgs({ activeTool: 'ellipse' });
  resolveToolSettingTargets(ellipseArgs as never).shape({ fillOpacity: 0.4 });
  expect(ellipseArgs.updateShapeSettings).toHaveBeenCalledWith('ellipse', { fillOpacity: 0.4 });
}

function expectSelectionShapeTarget() {
  const selectionArgs = createTargetArgs({
    activeTool: 'rectangle',
    selection: { hasSelection: true, selectedObjectType: 'rich-shape' },
  });
  resolveToolSettingTargets(selectionArgs as never).shape({ strokeOpacity: 0.5 });
  expect(selectionArgs.updateSelectionShapeSettings).toHaveBeenCalledWith('rectangle', {
    strokeOpacity: 0.5,
  });
}

function expectToolSpecificTargets() {
  const arrowArgs = createTargetArgs({ activeTool: 'arrow' });
  resolveToolSettingTargets(arrowArgs as never).arrow({ color: '#123456' } as never);
  expect(arrowArgs.updateArrowSettings).toHaveBeenCalled();

  const lineArgs = createTargetArgs({ activeTool: 'line' });
  resolveToolSettingTargets(lineArgs as never).line?.({ style: 'dash' } as never);
  expect(lineArgs.updateLineSettings).toHaveBeenCalledWith({ style: 'dash' });

  const blurArgs = createTargetArgs({ activeTool: 'blur' });
  resolveToolSettingTargets(blurArgs as never).blur({ amount: 8 } as never);
  expect(blurArgs.updateBlurSettings).toHaveBeenCalled();
}

function expectSelectedLineAndBrushTargets() {
  const selectedLineArgs = createTargetArgs({
    activeTool: 'select',
    selection: { hasSelection: true, selectedObjectType: 'line' },
  });
  resolveToolSettingTargets(selectedLineArgs as never).line?.({ corners: 'sharp' } as never);
  expect(selectedLineArgs.updateSelectionLineSettings).toHaveBeenCalledWith({
    corners: 'sharp',
  });

  const brushArgs = createTargetArgs({ activeTool: 'pencil' });
  resolveToolSettingTargets(brushArgs as never).brush('pencil', { color: '#123456' } as never);
  expect(brushArgs.updateBrushSettings).toHaveBeenCalledWith('pencil', { color: '#123456' });
}

function expectStepAndTextTargets() {
  const stepArgs = createTargetArgs({ activeTool: 'step' });
  resolveToolSettingTargets(stepArgs as never).step({ value: '2' } as never);
  expect(stepArgs.updateStepSettings).toHaveBeenCalled();

  const textArgs = createTargetArgs({ activeTool: 'text' });
  resolveToolSettingTargets(textArgs as never).text({ content: 'Label' } as never);
  expect(textArgs.updateTextSettings).toHaveBeenCalled();
}

function expectIgnoredLibraryShapeTarget() {
  const libraryArgs = createTargetArgs({ activeTool: 'shape-library' });
  resolveToolSettingTargets(libraryArgs as never).shape({ strokeWidth: 8 });
  expect(libraryArgs.updateShapeSettings).not.toHaveBeenCalled();
}

function expectSelectionApplierGuards(applyActiveSettingsToSelection: ReturnType<typeof vi.fn>) {
  expect(
    createSelectionSettingsApplier({
      activeTool: 'shape-library',
      applyActiveSettingsToSelection,
      selection: { hasSelection: true, selectedObjectType: 'rich-shape' },
    } as never)
  ).toBeNull();
  expectSelectionSettingsVisibility('select', true);
  expectSelectionSettingsVisibility('ellipse', false);
  expectSelectionSettingsVisibility('rectangle', true);
}

function expectImageSelectionSettingsHidden() {
  expect(
    shouldShowSelectionToolSettings({
      activeTool: 'rectangle',
      selection: { hasSelection: true, selectedObjectType: 'image' },
    } as never)
  ).toBe(false);
}

function registerToolTargetTest() {
  it('resolves active and selection tool setting targets by owner', () => {
    expectActiveShapeTarget();
    expectSelectionShapeTarget();
    expectIgnoredLibraryShapeTarget();
    expectToolSpecificTargets();
    expectSelectedLineAndBrushTargets();
    expectStepAndTextTargets();
  });

  it('creates selection settings appliers only for matching editable owners', () => {
    const applyActiveSettingsToSelection = vi.fn();
    const apply = createSelectionSettingsApplier({
      activeTool: 'rectangle',
      applyActiveSettingsToSelection,
      selection: { hasSelection: true, selectedObjectType: 'rich-shape' },
    } as never);
    apply?.();

    expect(applyActiveSettingsToSelection).toHaveBeenCalledOnce();
    expectSelectionApplierGuards(applyActiveSettingsToSelection);
    expectImageSelectionSettingsHidden();
  });
}

describe('editor sidebar action helper catalogs', () => {
  registerCatalogOptionsTest();
  registerPreviewUtilityTest();
  registerToolTargetTest();
});
