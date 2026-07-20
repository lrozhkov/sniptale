// @vitest-environment jsdom

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
import type { EditorShapeSettings } from '../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  createControllerMock,
  renderWithControllerAsync,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

const { appendBorderPresetMock, rememberRecentColorMock, toastErrorMock, toastSuccessMock } =
  vi.hoisted(() => ({
    appendBorderPresetMock: vi.fn(),
    rememberRecentColorMock: vi.fn(async () => undefined),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  }));

vi.mock('./actions.state', () => ({
  useBorderPresetsState: () => ({
    appendBorderPreset: appendBorderPresetMock,
    borderPresets: [DEFAULT_BORDER_PRESET],
  }),
  useRecentColorsState: () => ({
    recentColors: [],
    rememberRecentColor: rememberRecentColorMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

type SelectionActions = {
  applyArrowPatch: (patch: Partial<EditorToolSettings['arrow']>) => void;
  applyArrowPresetSettings: (settings: EditorToolSettings['arrow']) => void;
  applyBrushPatch: (
    tool: 'pencil' | 'highlighter',
    patch: Partial<EditorToolSettings['pencil']>
  ) => void;
  applyBrushPresetSettings: (
    tool: 'pencil' | 'highlighter',
    settings: EditorToolSettings['pencil']
  ) => void;
  applyPreset: (presetId: string) => void;
  applyShapePatch: (patch: Partial<EditorShapeSettings>) => void;
  applyShapePresetSettings: (owner: 'rectangle' | 'ellipse', settings: EditorShapeSettings) => void;
  applyStepPresetSettings: (settings: EditorToolSettings['step']) => void;
  applyTextPresetSettings: (settings: EditorToolSettings['text']) => void;
  applyTextStyle: (command: 'bold') => void;
};

function createSidebarActionArgs(overrides: Record<string, unknown> = {}) {
  return {
    activeTool: 'select',
    confirmOpenStorageManager: vi.fn(async () => false),
    defaultImagePresetId: 'preset-default',
    savePresets: createInspectorCommandParams().savePresets,
    selection: createInspectorCommandParams().selection,
    setBrowserFrame: vi.fn(),
    setFrameDraft: vi.fn(),
    shapeSettings: createInspectorCommandParams().inspectorToolSettings.rectangle,
    shapeTool: 'rectangle',
    textSettings: createInspectorCommandParams().inspectorToolSettings.text,
    updateArrowSettings: vi.fn(),
    updateBrushSettings: vi.fn(),
    updateSelectionArrowSettings: vi.fn(),
    updateSelectionBrushSettings: vi.fn(),
    updateSelectionShapeSettings: vi.fn(),
    updateSelectionStepSettings: vi.fn(),
    updateSelectionTextSettings: vi.fn(),
    updateShapeSettings: vi.fn(),
    updateStepSettings: vi.fn(),
    updateTextSettings: vi.fn(),
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
    ...overrides,
  } as never;
}

async function renderSelectionActionsHarness(args: {
  activeTool: 'select' | 'arrow';
  controller: ReturnType<typeof createControllerMock>;
  hasSelection: boolean;
  settingOverrides?: Record<string, unknown>;
}) {
  const { useEditorInspectorSidebarActions } = await import('./actions');
  let actions: unknown = null;

  const Harness: React.FC = () => {
    actions = useEditorInspectorSidebarActions(
      createSidebarActionArgs({
        activeTool: args.activeTool,
        selection: {
          ...createInspectorCommandParams().selection,
          hasSelection: args.hasSelection,
        },
        ...args.settingOverrides,
      }),
      false
    );

    return null;
  };

  await renderWithControllerAsync(<Harness />, args.controller);
  return actions as SelectionActions | null;
}

function registerSelectionTargetRoutingTest() {
  it('applies active settings to selection only when selection-owned targets are active', async () => {
    const controller = createControllerMock();
    const selectedActions = await renderSelectionActionsHarness({
      activeTool: 'select',
      controller,
      hasSelection: true,
    });

    selectedActions!.applyArrowPatch({ color: '#111111' } as never);
    expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledOnce();

    const plainActions = await renderSelectionActionsHarness({
      activeTool: 'arrow',
      controller,
      hasSelection: false,
    });

    plainActions!.applyArrowPatch({ color: '#222222' } as never);
    expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledOnce();
  });
}

function registerSelectionPresetSyncTest() {
  it('keeps manual selection patches local but syncs preset application into defaults', async () => {
    const controller = createControllerMock();
    const updateSelectionShapeSettings = vi.fn();
    const updateSelectionStepSettings = vi.fn();
    const updateShapeSettings = vi.fn();
    const updateStepSettings = vi.fn();
    const actions = await renderSelectionActionsHarness({
      activeTool: 'select',
      controller,
      hasSelection: true,
      settingOverrides: {
        updateSelectionShapeSettings,
        updateSelectionStepSettings,
        updateShapeSettings,
        updateStepSettings,
      },
    });

    actions!.applyShapePatch({ strokeColor: '#111111' } as never);
    actions!.applyPreset(DEFAULT_BORDER_PRESET.id);

    expect(updateSelectionShapeSettings).toHaveBeenCalledTimes(2);
    expect(updateSelectionStepSettings).toHaveBeenCalledOnce();
    expect(updateShapeSettings).toHaveBeenCalledOnce();
    expect(updateStepSettings).toHaveBeenCalledOnce();
    expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledTimes(2);
    expect(controller.refreshActiveToolSettingsPreview).not.toHaveBeenCalled();
  });
}

function registerPresetHeaderSelectionSyncTest() {
  it('applies preset header settings to both selection and tool defaults', async () => {
    const controller = createControllerMock();
    const updateSelectionShapeSettings = vi.fn();
    const updateShapeSettings = vi.fn();
    const actions = await renderSelectionActionsHarness({
      activeTool: 'select',
      controller,
      hasSelection: true,
      settingOverrides: {
        updateSelectionShapeSettings,
        updateShapeSettings,
      },
    });

    actions!.applyShapePresetSettings('rectangle', {
      borderPresetId: 'preset-2',
      strokeColor: '#222222',
    } as never);

    expect(updateSelectionShapeSettings).toHaveBeenCalledWith('rectangle', {
      borderPresetId: 'preset-2',
      strokeColor: '#222222',
    });
    expect(updateShapeSettings).toHaveBeenCalledWith('rectangle', {
      borderPresetId: 'preset-2',
      strokeColor: '#222222',
    });
    expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledOnce();
    expect(controller.refreshActiveToolSettingsPreview).not.toHaveBeenCalled();
  });
}

function registerDefaultPresetHeaderSyncTest() {
  it('updates default preset settings and refreshes preview when selection is inactive', async () => {
    const controller = createControllerMock();
    const updateBrushSettings = vi.fn();
    const updateShapeSettings = vi.fn();
    const updateStepSettings = vi.fn();
    const actions = await renderSelectionActionsHarness({
      activeTool: 'arrow',
      controller,
      hasSelection: false,
      settingOverrides: {
        shapeTool: 'ellipse',
        updateBrushSettings,
        updateShapeSettings,
        updateStepSettings,
      },
    });

    actions!.applyBrushPresetSettings('pencil', { color: '#333333' } as never);
    actions!.applyPreset(DEFAULT_BORDER_PRESET.id);

    expect(updateBrushSettings).toHaveBeenCalledWith('pencil', { color: '#333333' });
    expect(updateShapeSettings).toHaveBeenCalledWith('ellipse', expect.any(Object));
    expect(updateStepSettings).toHaveBeenCalledWith(expect.any(Object));
    expect(controller.applyActiveSettingsToSelection).not.toHaveBeenCalled();
    expect(controller.refreshActiveToolSettingsPreview).toHaveBeenCalledTimes(2);
  });
}

function registerDefaultToolPatchTests() {
  it('refreshes active tool preview after default style patches', async () => {
    const controller = createControllerMock();
    const updateBrushSettings = vi.fn();
    const updateTextSettings = vi.fn();
    const actions = await renderSelectionActionsHarness({
      activeTool: 'arrow',
      controller,
      hasSelection: false,
      settingOverrides: { updateBrushSettings, updateTextSettings },
    });

    actions!.applyBrushPatch('pencil', { color: '#222222' });
    actions!.applyTextStyle('bold');

    expect(updateBrushSettings).toHaveBeenCalledWith('pencil', { color: '#222222' });
    expect(updateTextSettings).toHaveBeenCalledWith({ fontWeight: 'bold' });
    expect(controller.applyActiveSettingsToSelection).not.toHaveBeenCalled();
    expect(controller.refreshActiveToolSettingsPreview).toHaveBeenCalledTimes(2);
  });
}

function registerTextStyleSelectionTests() {
  it('keeps inline text style commands on the active Fabric selection when possible', async () => {
    const controller = createControllerMock();
    controller.applyTextSelectionStyle.mockReturnValue(true);
    const updateSelectionTextSettings = vi.fn();
    const actions = await renderSelectionActionsHarness({
      activeTool: 'select',
      controller,
      hasSelection: true,
      settingOverrides: { updateSelectionTextSettings },
    });

    actions!.applyTextStyle('bold');

    expect(controller.applyTextSelectionStyle).toHaveBeenCalledWith('bold');
    expect(updateSelectionTextSettings).not.toHaveBeenCalled();
    expect(controller.applyActiveSettingsToSelection).not.toHaveBeenCalled();
  });
}

describe('editor sidebar actions selection patches', () => {
  registerSelectionTargetRoutingTest();
  registerSelectionPresetSyncTest();
  registerPresetHeaderSelectionSyncTest();
  registerDefaultPresetHeaderSyncTest();
  registerDefaultToolPatchTests();
  registerTextStyleSelectionTests();
});
