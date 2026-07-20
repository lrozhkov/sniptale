// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  createControllerMock,
  getEditorInspectorOwnershipMocks,
  renderWithControllerAsync,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

const { rememberRecentColorMock } = vi.hoisted(() => ({
  rememberRecentColorMock: vi.fn(async () => undefined),
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

function createSidebarActionArgs(overrides: Record<string, unknown> = {}) {
  return {
    activeTool: 'select',
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    confirmOpenStorageManager: vi.fn(async () => false),
    defaultImagePresetId: 'preset-default',
    savePresets: createInspectorCommandParams().savePresets,
    selection: createInspectorCommandParams().selection,
    setBrowserFrame: vi.fn(),
    setFrameDraft: vi.fn(),
    setWorkspaceColorError: vi.fn(),
    setWorkspaceDefaultSavePending: vi.fn(),
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
    updateWorkspace: vi.fn(),
    updateWorkspaceDefaults: vi.fn(),
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
    workspaceDefaultColor: '#ffffff',
    ...overrides,
  };
}

async function renderSidebarActions(
  args: ReturnType<typeof createSidebarActionArgs>,
  hasImage: boolean,
  controller = createControllerMock()
) {
  const { useEditorInspectorSidebarActions } = await import('./actions');
  let actions: ReturnType<typeof useEditorInspectorSidebarActions> | null = null;
  const Harness: React.FC = () => {
    actions = useEditorInspectorSidebarActions(args as never, hasImage);
    return null;
  };

  await renderWithControllerAsync(<Harness />, controller);
  return { actions: actions!, controller };
}

describe('useEditorInspectorSidebarActions workspace color wiring', () => {
  it('routes no-image sidebar actions and workspace color through the hook', async () => {
    const args = createSidebarActionArgs({ setBrowserFrame: vi.fn() });
    const { actions, controller } = await renderSidebarActions(args, false);

    actions.applyArrowPatch({ color: '#111111' } as never);
    actions.applyBrushPatch('pencil', { color: '#222222' } as never);
    actions.applyShapePatch({ strokeColor: '#333333' } as never);
    actions.applyStepPatch({ value: '2' } as never);
    actions.applyTextPatch({ fontSize: 24 } as never);
    actions.applyTextStyle('bold');
    await actions.syncBrowserFrame({ enabled: true });
    await actions.onCopyRenderedImage();
    actions.onApplyFrame();
    await actions.applyWorkspaceColor('#abcdef');

    expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledTimes(6);
    expect(controller.applyBrowserFrame).not.toHaveBeenCalled();
    expect(args.setBrowserFrame).toHaveBeenCalled();
    expect(args.updateWorkspace).toHaveBeenCalledWith({ backgroundColor: '#abcdef' });
    expect(args.setWorkspaceColorError).toHaveBeenCalledWith(null);
    expect(rememberRecentColorMock).toHaveBeenCalledWith('#abcdef');
  });

  it('routes image-owned browser frame and copy branches through the hook', async () => {
    const { addBorderPresetMock, toastErrorMock, toastSuccessMock } =
      getEditorInspectorOwnershipMocks();
    const { actions, controller } = await renderSidebarActions(createSidebarActionArgs(), true);

    await actions.syncBrowserFrame({ title: 'Header title' });
    await actions.insertOrUpdateBrowserFrame?.();
    await actions.onCopyRenderedImage();
    await actions.saveShapeAsHighlighterPreset();
    addBorderPresetMock.mockRejectedValueOnce(new Error('storage failed'));
    await actions.saveShapeAsHighlighterPreset();
    controller.copyRenderedImage = vi.fn(async () => {
      throw new Error('copy failed');
    });
    await expect(actions.onCopyRenderedImage()).rejects.toThrow();

    expect(controller.applyBrowserFrame).toHaveBeenCalled();
    expect(controller.copyRenderedImage).toHaveBeenCalled();
    expect(addBorderPresetMock).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalled();
  });
});
