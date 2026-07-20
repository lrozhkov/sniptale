// @vitest-environment jsdom

import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  createControllerMock,
  renderWithControllerAsync,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

const { rememberRecentColorMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  rememberRecentColorMock: vi.fn(async () => undefined),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('./actions.state', () => ({
  useBorderPresetsState: () => ({
    appendBorderPreset: vi.fn(),
    borderPresets: [DEFAULT_BORDER_PRESET],
  }),
  useRecentColorsState: () => ({
    recentColors: [],
    rememberRecentColor: rememberRecentColorMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createImageActionsHarness(
  useEditorInspectorSidebarActions: typeof import('./actions').useEditorInspectorSidebarActions,
  updateSelectionImageSettings: ReturnType<typeof vi.fn>,
  assignActions: (actions: {
    applyImagePatch: (patch: { radius?: number }) => void;
    previewImagePatch: (patch: { opacity?: number }) => void;
  }) => void
) {
  const Harness: React.FC = () => {
    const params = createInspectorCommandParams();
    assignActions(
      useEditorInspectorSidebarActions(
        createImageActionParams(params, updateSelectionImageSettings),
        false
      )
    );
    return null;
  };
  return Harness;
}

function createImageActionParams(
  params: ReturnType<typeof createInspectorCommandParams>,
  updateSelectionImageSettings: ReturnType<typeof vi.fn>
) {
  return {
    activeTool: 'select',
    confirmOpenStorageManager: vi.fn(async () => false),
    defaultImagePresetId: 'preset-default',
    savePresets: params.savePresets,
    selection: {
      ...params.selection,
      hasSelection: true,
      selectedObjectType: 'image',
    },
    setBrowserFrame: vi.fn(),
    setFrameDraft: vi.fn(),
    shapeSettings: params.inspectorToolSettings.rectangle,
    shapeTool: 'rectangle',
    textSettings: params.inspectorToolSettings.text,
    updateSelectionImageSettings,
    updateImageSettings: vi.fn(),
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
    ...createUnusedActionWriters(),
  } as never;
}

function createUnusedActionWriters() {
  return {
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
  };
}

it('applies and previews image layer settings through selection-owned image handlers', async () => {
  const { useEditorInspectorSidebarActions } = await import('./actions');
  const controller = createControllerMock();
  const updateSelectionImageSettings = vi.fn();
  let actions: {
    applyImagePatch: (patch: { radius?: number }) => void;
    previewImagePatch: (patch: { opacity?: number }) => void;
  } | null = null;
  const Harness = createImageActionsHarness(
    useEditorInspectorSidebarActions,
    updateSelectionImageSettings,
    (nextActions) => {
      actions = nextActions;
    }
  );

  await renderWithControllerAsync(<Harness />, controller);
  actions!.applyImagePatch({ radius: 14 });
  actions!.previewImagePatch({ opacity: 0.4 });

  expect(updateSelectionImageSettings).toHaveBeenCalledWith({ radius: 14 });
  expect(updateSelectionImageSettings).toHaveBeenCalledWith({ opacity: 0.4 });
  expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledOnce();
});
