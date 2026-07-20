// @vitest-environment jsdom

import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
import {
  createControllerMock,
  renderWithControllerAsync,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

beforeEach(() => {
  vi.clearAllMocks();
});

type SelectionHistoryActions = {
  commitPendingSelectionSettings: () => void;
  previewShapePatch: (patch: { strokeWidth?: number }) => void;
};

async function renderSelectionHistoryHarness(args: {
  controller: ReturnType<typeof createControllerMock>;
}) {
  const { useEditorInspectorSidebarActions } = await import('./actions');
  let actions: unknown = null;

  const Harness: React.FC = () => {
    actions = useEditorInspectorSidebarActions(
      {
        activeTool: 'select',
        browserFrame: createInspectorCommandParams().browserFrame,
        confirmOpenStorageManager: vi.fn(async () => false),
        defaultImagePresetId: 'preset-default',
        savePresets: createInspectorCommandParams().savePresets,
        selection: {
          ...createInspectorCommandParams().selection,
          hasSelection: false,
        },
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
      } as never,
      false
    );

    return null;
  };

  await renderWithControllerAsync(<Harness />, args.controller);
  return actions as SelectionHistoryActions | null;
}

it('refreshes the active tool preview immediately when selection history is disabled', async () => {
  const controller = createControllerMock();
  const actions = await renderSelectionHistoryHarness({ controller });

  actions!.previewShapePatch({ strokeWidth: 9 });
  actions!.commitPendingSelectionSettings();

  expect(controller.refreshActiveToolSettingsPreview).toHaveBeenCalledOnce();
  expect(controller.previewActiveSettingsOnSelection).not.toHaveBeenCalled();
  expect(controller.commitHistory).not.toHaveBeenCalled();
});

it('returns early when selection history commit has no captured baseline', async () => {
  const controller = createControllerMock();
  const actions = await renderSelectionHistoryHarness({ controller });

  actions!.commitPendingSelectionSettings();

  expect(controller.previewActiveSettingsOnSelection).not.toHaveBeenCalled();
  expect(controller.commitHistory).not.toHaveBeenCalled();
});
