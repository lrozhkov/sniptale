// @vitest-environment jsdom

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BrowserFrameState,
  EditorShapeSettings,
} from '../../../features/editor/document/types';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../features/editor/document/constants';
import {
  createControllerMock,
  renderWithControllerAsync,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { useEditorStore } from '../../state/useEditorStore';

beforeEach(() => {
  vi.clearAllMocks();
});

type SelectionHistoryActions = {
  commitPendingSelectionSettings: () => void;
  previewShapePatch: (patch: Partial<EditorShapeSettings>) => void;
};

type BrowserFrameActions = {
  onApplyFrame: () => void;
  onCopyRenderedImage: () => Promise<void> | void;
  insertOrUpdateBrowserFrame?: () => Promise<void> | void;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
};

function patchSelectionRectangleSettings(patch: Partial<EditorShapeSettings>) {
  useEditorStore.setState((state) => ({
    selectionToolSettings: {
      ...state.selectionToolSettings,
      rectangle: {
        ...state.selectionToolSettings.rectangle,
        ...patch,
      },
    },
  }));
}

function applySelectionShapePatch(
  owner: 'ellipse' | 'rectangle',
  patch: Partial<EditorShapeSettings>
) {
  if (owner !== 'rectangle') {
    throw new Error(`Unexpected selection shape owner in test: ${owner}`);
  }

  patchSelectionRectangleSettings(patch);
}

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

async function renderSelectionHistoryHarness(args: {
  controller: ReturnType<typeof createControllerMock>;
  settingOverrides?: Record<string, unknown>;
}) {
  const { useEditorInspectorSidebarActions } = await import('./actions');
  let actions: unknown = null;

  const Harness: React.FC = () => {
    actions = useEditorInspectorSidebarActions(
      createSidebarActionArgs({
        selection: {
          ...createInspectorCommandParams().selection,
          hasSelection: true,
        },
        ...args.settingOverrides,
      }),
      false
    );

    return null;
  };

  await renderWithControllerAsync(<Harness />, args.controller);
  return actions as SelectionHistoryActions | null;
}

async function renderBrowserFrameActionsHarness(args: {
  browserFrame?: BrowserFrameState;
  controller: ReturnType<typeof createControllerMock>;
  hasImage: boolean;
  setBrowserFrame: ReturnType<typeof vi.fn>;
}) {
  const { useEditorInspectorSidebarActions } = await import('./actions');
  let actions: unknown = null;
  useEditorStore.setState({
    browserFrame: args.browserFrame ?? DEFAULT_BROWSER_FRAME_STATE,
  });

  const Harness: React.FC = () => {
    actions = useEditorInspectorSidebarActions(
      createSidebarActionArgs({
        ...(args.browserFrame ? { browserFrame: args.browserFrame } : {}),
        setBrowserFrame: args.setBrowserFrame,
      }),
      args.hasImage
    );

    return null;
  };

  await renderWithControllerAsync(<Harness />, args.controller);
  return actions as BrowserFrameActions | null;
}

function registerSelectionHistorySuite() {
  it('defers selection history until the previewed value is committed', async () => {
    const controller = createControllerMock();
    const actions = await renderSelectionHistoryHarness({
      controller,
      settingOverrides: {
        updateSelectionShapeSettings: applySelectionShapePatch,
      },
    });

    actions!.previewShapePatch({ strokeWidth: 7 });

    expect(controller.commitHistory).not.toHaveBeenCalled();
    expect(controller.previewActiveSettingsOnSelection).toHaveBeenCalledOnce();

    actions!.commitPendingSelectionSettings();

    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.previewActiveSettingsOnSelection).toHaveBeenCalledTimes(2);
  });

  it('skips selection history when the preview returns to the baseline value', async () => {
    const controller = createControllerMock();
    const baselineStrokeWidth =
      useEditorStore.getState().selectionToolSettings.rectangle.strokeWidth;
    const actions = await renderSelectionHistoryHarness({
      controller,
      settingOverrides: {
        updateSelectionShapeSettings: applySelectionShapePatch,
      },
    });

    actions!.previewShapePatch({ strokeWidth: baselineStrokeWidth + 1 });
    actions!.previewShapePatch({ strokeWidth: baselineStrokeWidth });
    actions!.commitPendingSelectionSettings();

    expect(controller.previewActiveSettingsOnSelection).toHaveBeenCalledTimes(3);
    expect(controller.commitHistory).not.toHaveBeenCalled();
  });
}

function registerBrowserFrameSyncSuite() {
  it('syncs browser frame through local fallback and controller-owned branches', async () => {
    const controller = createControllerMock();
    const setBrowserFrame = vi.fn();
    const localActions = await renderBrowserFrameActionsHarness({
      controller,
      hasImage: false,
      setBrowserFrame,
    });

    localActions!.onApplyFrame();
    await localActions!.onCopyRenderedImage();
    await localActions!.syncBrowserFrame({ title: 'Local draft' });

    expect(setBrowserFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Local draft',
      })
    );
    expect(controller.applyFrameSettings).toHaveBeenCalledOnce();
    expect(controller.applyBrowserFrame).not.toHaveBeenCalled();

    const imageActions = await renderBrowserFrameActionsHarness({
      controller,
      hasImage: true,
      setBrowserFrame,
    });

    await imageActions!.onCopyRenderedImage();
    await imageActions!.syncBrowserFrame({ title: 'Updated title' });
    await imageActions!.insertOrUpdateBrowserFrame?.();

    expect(controller.copyRenderedImage).toHaveBeenCalledOnce();
    expect(controller.applyBrowserFrame).toHaveBeenCalledOnce();
  });

  it('keeps browser-frame changes local until insert or update is requested', async () => {
    const controller = createControllerMock();
    const actions = await renderBrowserFrameActionsHarness({
      controller,
      hasImage: true,
      setBrowserFrame: vi.fn(),
    });

    await actions!.syncBrowserFrame({ title: 'Deferred title' });

    expect(controller.applyBrowserFrame).not.toHaveBeenCalled();
  });
}

function registerBrowserFrameHistorySuite() {
  it('applies the latest browser-frame draft through insert or update', async () => {
    const controller = createControllerMock();
    const setBrowserFrame = vi.fn((browserFrame) => {
      useEditorStore.setState({ browserFrame: browserFrame as BrowserFrameState });
    });
    const actions = await renderBrowserFrameActionsHarness({
      browserFrame: {
        ...DEFAULT_BROWSER_FRAME_STATE,
        title: 'Initial title',
      },
      controller,
      hasImage: true,
      setBrowserFrame,
    });

    await actions!.syncBrowserFrame({ title: 'Preview title' });
    await actions!.insertOrUpdateBrowserFrame?.();

    expect(setBrowserFrame).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Preview title' })
    );
    expect(controller.applyBrowserFrame).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Preview title' })
    );
  });

  it('does not apply browser-frame changes while the draft matches the baseline until insert is pressed', async () => {
    const controller = createControllerMock();
    const actions = await renderBrowserFrameActionsHarness({
      browserFrame: {
        ...DEFAULT_BROWSER_FRAME_STATE,
        title: '',
      },
      controller,
      hasImage: true,
      setBrowserFrame: vi.fn(),
    });

    await actions!.syncBrowserFrame({ title: DEFAULT_BROWSER_FRAME_STATE.title });

    expect(controller.applyBrowserFrame).not.toHaveBeenCalled();
  });
}

describe('editor sidebar actions selection history preview', registerSelectionHistorySuite);
describe('editor sidebar actions browser frame sync', registerBrowserFrameSyncSuite);
describe('editor sidebar actions browser frame history preview', registerBrowserFrameHistorySuite);
