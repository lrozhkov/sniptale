// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTextSettingsStylePatchMock: vi.fn(() => ({ fontWeight: 'bold' })),
  previewSelectionSettingsMock: vi.fn((applyPreviewPatch?: () => void) => applyPreviewPatch?.()),
  shouldUseSelectionToolSettingsMock: vi.fn(() => true),
  commitPendingSelectionSettingsMock: vi.fn(),
}));

vi.mock('../../controller/text-formatting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../controller/text-formatting')>()),
  getTextSettingsStylePatch: mocks.getTextSettingsStylePatchMock,
}));
vi.mock('./history-preview', () => ({
  useSelectionSettingsHistoryPreview: () => ({
    commitPendingSelectionSettings: mocks.commitPendingSelectionSettingsMock,
    previewSelectionSettings: mocks.previewSelectionSettingsMock,
  }),
}));

vi.mock('./actions.helpers', () => ({
  shouldUseSelectionToolSettings: mocks.shouldUseSelectionToolSettingsMock,
}));

import { createPresetHeaderActions, useSidebarSelectionPatchActions } from './selection-actions';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController() {
  return {
    applyActiveSettingsToSelection: vi.fn(),
    applyTextSelectionStyle: vi.fn(() => false),
    refreshActiveToolSettingsPreview: vi.fn(),
  };
}

function createTargets() {
  return {
    arrow: vi.fn(),
    line: vi.fn(),
    brush: vi.fn(),
    blur: vi.fn(),
    shape: vi.fn(),
    step: vi.fn(),
    text: vi.fn(),
  };
}

function renderSelectionActions(options: {
  activeTool?: 'select' | 'arrow';
  controller?: ReturnType<typeof createController>;
  shapeTool?: 'ellipse' | 'rectangle';
  selection?: { hasSelection: boolean };
  targets?: ReturnType<typeof createTargets>;
}) {
  const result = {
    current: null as ReturnType<typeof useSidebarSelectionPatchActions> | null,
  };
  const controller = options.controller ?? createController();
  const targets = options.targets ?? createTargets();

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  function Harness() {
    result.current = useSidebarSelectionPatchActions({
      activeTool: options.activeTool ?? 'select',
      controller: controller as never,
      shapeTool: options.shapeTool ?? 'rectangle',
      selection: (options.selection ?? { hasSelection: true }) as never,
      targets: targets as never,
      textSettings: {
        backgroundColor: '#ffffff',
        backgroundOpacity: 1,
        calloutFormat: 'panel',
        fontFamily: 'sans',
        fontSize: 16,
        fontStyle: 'normal',
        fontWeight: 'normal',
        linethrough: false,
        shadow: 0,
        tailSize: 12,
        textColor: '#111111',
        underline: false,
      } as never,
      updateShapeSettings: vi.fn(),
      updateStepSettings: vi.fn(),
    });

    return null;
  }

  act(() => root?.render(<Harness />));
  return { controller, result, targets };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTextSettingsStylePatchMock.mockReturnValue({ fontWeight: 'bold' });
  mocks.previewSelectionSettingsMock.mockImplementation((applyPreviewPatch?: () => void) =>
    applyPreviewPatch?.()
  );
  mocks.shouldUseSelectionToolSettingsMock.mockReturnValue(true);
});

function registerPresetHeaderSelectionTest() {
  it('syncs preset header updates to selection and defaults, including pencil recognition policy', () => {
    const controller = createController();
    const args = createPresetHeaderActionArgs(controller, true);
    const actions = createPresetHeaderActions(args as never);

    actions.applyArrowPresetSettings({ color: '#111111' } as never);
    actions.applyLinePresetSettings({ width: 5 } as never);
    actions.applyBlurPresetSettings({
      amount: 10,
      blurType: 'gaussian',
      showBorder: false,
    } as never);
    actions.applyBrushPresetSettings('pencil', { color: '#222222' } as never);
    actions.applyShapePresetSettings('rectangle', { strokeColor: '#333333' } as never);
    actions.applyStepPresetSettings({ color: '#444444' } as never);
    actions.applyTextPresetSettings({ textColor: '#555555' } as never);
    actions.setPencilShapeCorrection('strong');

    expectPresetHeaderSelectionCalls(args, controller);
  });
}

function createPresetHeaderActionArgs(
  controller: ReturnType<typeof createController>,
  selectionSettingsEnabled: boolean
) {
  return {
    controller,
    selectionSettingsEnabled,
    updateArrowSettings: vi.fn(),
    updateLineSettings: vi.fn(),
    updateBlurSettings: vi.fn(),
    updateBrushSettings: vi.fn(),
    updateSelectionBlurSettings: vi.fn(),
    updateSelectionArrowSettings: vi.fn(),
    updateSelectionLineSettings: vi.fn(),
    updateSelectionBrushSettings: vi.fn(),
    updateSelectionShapeSettings: vi.fn(),
    updateSelectionStepSettings: vi.fn(),
    updateSelectionTextSettings: vi.fn(),
    updateShapeSettings: vi.fn(),
    updateStepSettings: vi.fn(),
    updateTextSettings: vi.fn(),
  };
}

function expectPresetHeaderSelectionCalls(
  args: ReturnType<typeof createPresetHeaderActionArgs>,
  controller: ReturnType<typeof createController>
) {
  expect(args.updateSelectionBlurSettings).toHaveBeenCalledWith({
    amount: 10,
    blurType: 'gaussian',
    showBorder: false,
  });
  expect(args.updateSelectionArrowSettings).toHaveBeenCalledWith({ color: '#111111' });
  expect(args.updateSelectionLineSettings).toHaveBeenCalledWith({ width: 5 });
  expect(args.updateSelectionBrushSettings).toHaveBeenCalledWith('pencil', { color: '#222222' });
  expect(args.updateSelectionShapeSettings).toHaveBeenCalledWith('rectangle', {
    strokeColor: '#333333',
  });
  expect(args.updateSelectionStepSettings).toHaveBeenCalledWith({ color: '#444444' });
  expect(args.updateSelectionTextSettings).toHaveBeenCalledWith({ textColor: '#555555' });
  expect(args.updateBrushSettings).toHaveBeenCalledWith('pencil', {
    shapeCorrection: 'strong',
  });
  expect(args.updateSelectionBrushSettings).toHaveBeenCalledWith('pencil', {
    shapeCorrection: 'strong',
  });
  expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledTimes(7);
  expect(controller.refreshActiveToolSettingsPreview).not.toHaveBeenCalled();
}

function registerPresetHeaderDefaultPreviewTest() {
  it('refreshes tool preview when preset headers update defaults without selection ownership', () => {
    const controller = createController();
    const actions = createPresetHeaderActions({
      controller,
      selectionSettingsEnabled: false,
      updateArrowSettings: vi.fn(),
      updateLineSettings: vi.fn(),
      updateBlurSettings: vi.fn(),
      updateBrushSettings: vi.fn(),
      updateSelectionBlurSettings: vi.fn(),
      updateSelectionArrowSettings: vi.fn(),
      updateSelectionLineSettings: vi.fn(),
      updateSelectionBrushSettings: vi.fn(),
      updateSelectionShapeSettings: vi.fn(),
      updateSelectionStepSettings: vi.fn(),
      updateSelectionTextSettings: vi.fn(),
      updateShapeSettings: vi.fn(),
      updateStepSettings: vi.fn(),
      updateTextSettings: vi.fn(),
    } as never);

    actions.applyBrushPresetSettings('highlighter', { color: '#666666' } as never);

    expect(controller.refreshActiveToolSettingsPreview).toHaveBeenCalledOnce();
  });
}

function registerSelectionPatchHookTest() {
  it('routes apply, preview, commit, and text-style patches through the selected ownership targets', () => {
    const { controller, result, targets } = renderSelectionActions({});
    const actions = result.current!.selectionPatchActions;

    actions.applyArrowPatch({ color: '#111111' });
    actions.applyLinePatch({ width: 5 });
    actions.applyBlurPatch({ amount: 12 });
    actions.applyBrushPatch('pencil', { width: 6 });
    actions.applyPresetPatch({
      shape: { strokeColor: '#222222' },
      step: { color: '#333333' } as never,
    });
    actions.applyShapePatch({ strokeWidth: 4 });
    actions.applyStepPatch({ value: '2' });
    actions.applyTextPatch({ textColor: '#444444' });
    actions.applyTextStyle('bold');
    actions.previewArrowPatch({ opacity: 0.8 });
    actions.previewLinePatch({ roughness: 0.5 });
    actions.previewBlurPatch({ blurType: 'solid' });
    actions.previewBrushPatch('highlighter', { opacity: 0.3 });
    actions.previewShapePatch({ fillOpacity: 0.4 });
    actions.previewStepPatch({ color: '#555555' } as never);
    actions.previewTextPatch({ backgroundColor: '#000000' });
    actions.commitPendingSelectionSettings();

    expect(targets.blur).toHaveBeenCalledWith({ amount: 12 });
    expect(targets.arrow).toHaveBeenCalledWith({ color: '#111111' });
    expect(targets.line).toHaveBeenCalledWith({ width: 5 });
    expect(targets.brush).toHaveBeenCalledWith('pencil', { width: 6 });
    expect(targets.shape).toHaveBeenCalledWith({ strokeColor: '#222222' });
    expect(targets.step).toHaveBeenCalledWith({ color: '#333333' });
    expect(targets.shape).toHaveBeenCalledWith({ strokeWidth: 4 });
    expect(targets.step).toHaveBeenCalledWith({ value: '2' });
    expect(targets.text).toHaveBeenCalledWith({ textColor: '#444444' });
    expect(targets.text).toHaveBeenCalledWith({ fontWeight: 'bold' });
    expect(mocks.getTextSettingsStylePatchMock).toHaveBeenCalledWith(expect.any(Object), 'bold');
    expect(mocks.previewSelectionSettingsMock).toHaveBeenCalledTimes(7);
    expect(mocks.commitPendingSelectionSettingsMock).toHaveBeenCalledOnce();
    expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledTimes(9);
  });
}

function registerSelectionPatchGuardTest() {
  it('skips commit and inline text patching when selection-owned settings are inactive or handled in place', () => {
    mocks.shouldUseSelectionToolSettingsMock.mockReturnValue(false);
    const controller = createController();
    controller.applyTextSelectionStyle.mockReturnValue(true);
    const { result, targets } = renderSelectionActions({
      activeTool: 'arrow',
      controller,
      selection: { hasSelection: false },
      shapeTool: 'ellipse',
    });
    const actions = result.current!.selectionPatchActions;

    actions.applyBrushPatch('pencil', { color: '#777777' });
    actions.applyPresetPatch({
      shape: { fillColor: '#888888' },
      step: { value: '3' } as never,
    });
    actions.applyTextStyle('bold');
    actions.commitPendingSelectionSettings();

    expect(targets.brush).toHaveBeenCalledWith('pencil', { color: '#777777' });
    expect(targets.shape).not.toHaveBeenCalledWith({ fillColor: '#888888' });
    expect(targets.step).not.toHaveBeenCalledWith({ value: '3' });
    expect(targets.text).not.toHaveBeenCalledWith({ fontWeight: 'bold' });
    expect(controller.refreshActiveToolSettingsPreview).toHaveBeenCalledTimes(2);
    expect(mocks.commitPendingSelectionSettingsMock).not.toHaveBeenCalled();
  });
}
describe('inspector sidebar selection actions seam', () => {
  registerPresetHeaderSelectionTest();
  registerPresetHeaderDefaultPreviewTest();
  registerSelectionPatchHookTest();
  registerSelectionPatchGuardTest();
});
