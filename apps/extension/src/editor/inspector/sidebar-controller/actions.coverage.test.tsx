// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  controller: {
    applyActiveSettingsToSelection: vi.fn(),
    applyBrowserFrame: vi.fn(async () => undefined),
    applyFrameSettings: vi.fn(),
    applyTextSelectionStyle: vi.fn(),
    commitHistory: vi.fn(),
    copyRenderedImage: vi.fn(async () => undefined),
    refreshActiveToolSettingsPreview: vi.fn(),
  },
  previewSelectionSettings: vi.fn((callback: () => void) => callback()),
  storeState: { browserFrame: { enabled: false, style: 'browser' } },
  utility: { id: 'utility' },
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => mocks.controller,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => mocks.storeState },
}));
vi.mock('./actions.state', () => ({
  useBorderPresetsState: () => ({
    borderPresets: [
      { enabled: true, id: 'visible', name: 'Visible' },
      { enabled: false, id: 'hidden', name: 'Hidden' },
    ],
    defaultBorderPresetId: 'visible',
  }),
  useRecentColorsState: () => ({ recentColors: ['#111111'], rememberRecentColor: vi.fn() }),
}));
vi.mock('./history-preview', () => ({
  useSelectionSettingsHistoryPreview: () => ({
    commitPendingSelectionSettings: vi.fn(),
    previewSelectionSettings: mocks.previewSelectionSettings,
  }),
}));
vi.mock('./actions.helpers', () => ({
  buildSidebarUtilityActions: () => mocks.utility,
  createStaticSidebarOptions: () => ({ id: 'static' }),
}));
vi.mock('./workspace-color-action', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./workspace-color-action')>()),
  createWorkspaceColorActionForSidebar: () => vi.fn(),
  createWorkspaceDefaultSaveActionForSidebar: () => vi.fn(),
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: vi.fn() },
}));

import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { useEditorInspectorSidebarActions } from './actions';

function createArgs(selectedObjectType: string | null, hasSelection = true) {
  return {
    confirmOpenLibrary: vi.fn(),
    defaultImagePresetId: null,
    frameDraft: { paddingTop: 1 },
    savePresets: [],
    selection: { hasSelection, selectedObjectLocked: false, selectedObjectType },
    setBrowserFrame: vi.fn(),
    setFrameDraft: vi.fn(),
    updateImageSettings: vi.fn(),
    updateSelectionImageSettings: vi.fn(),
    updateSelectionStepSettings: vi.fn(),
    updateStepSettings: vi.fn(),
  } as any;
}

function renderActions(args: ReturnType<typeof createArgs>, hasImage: boolean) {
  let result: ReturnType<typeof useEditorInspectorSidebarActions> | undefined;
  const container = document.createElement('div');
  const root = createRoot(container);
  function Harness() {
    result = useEditorInspectorSidebarActions(args, hasImage);
    return null;
  }
  act(() => root.render(<Harness />));
  return {
    get result() {
      return result!;
    },
    root,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.controller.copyRenderedImage.mockResolvedValue(undefined);
});

it('routes selected image and step changes through selection history', async () => {
  const imageArgs = createArgs('image');
  const image = renderActions(imageArgs, true);
  image.result.selectionActions.applyImagePatch({ opacity: 0.5 });
  image.result.selectionActions.previewImagePatch({ opacity: 0.6 });
  image.result.selectionActions.applyTextStyle('bold');
  await image.result.editorActions.syncBrowserFrame({ enabled: true });
  await image.result.editorActions.insertOrUpdateBrowserFrame();
  image.result.editorActions.onApplyFrame();
  await image.result.editorActions.onCopyRenderedImage();

  expect(imageArgs.updateSelectionImageSettings).toHaveBeenCalledTimes(2);
  expect(mocks.controller.applyActiveSettingsToSelection).toHaveBeenCalledTimes(2);
  expect(mocks.controller.commitHistory).toHaveBeenCalledOnce();
  expect(imageArgs.setBrowserFrame).toHaveBeenCalledWith({
    enabled: true,
    style: 'browser',
  });
  expect(mocks.controller.applyBrowserFrame).toHaveBeenCalled();
  expect(mocks.controller.applyFrameSettings).toHaveBeenCalledWith(imageArgs.frameDraft);
  expect(mocks.controller.copyRenderedImage).toHaveBeenCalled();
  expect(image.result.catalogActions.borderPresetOptions).toEqual([
    { label: 'Visible', value: 'visible' },
  ]);
  image.root.unmount();

  const stepArgs = createArgs('step');
  const step = renderActions(stepArgs, true);
  step.result.selectionActions.applyStepPatch({ value: '2' });
  step.result.selectionActions.previewStepPatch({ value: '3' });
  expect(stepArgs.updateSelectionStepSettings).toHaveBeenCalledTimes(2);
  step.root.unmount();
});

it('routes tool defaults, no-image guards, and copy failures', async () => {
  const args = createArgs(null, false);
  const harness = renderActions(args, false);
  harness.result.selectionActions.applyImagePatch({ opacity: 0.5 });
  harness.result.selectionActions.applyStepPatch({ value: '2' });
  await harness.result.editorActions.insertOrUpdateBrowserFrame();
  await harness.result.editorActions.onCopyRenderedImage();

  expect(args.updateImageSettings).toHaveBeenCalled();
  expect(args.updateStepSettings).toHaveBeenCalled();
  expect(mocks.controller.refreshActiveToolSettingsPreview).toHaveBeenCalled();
  expect(mocks.controller.applyBrowserFrame).not.toHaveBeenCalled();
  expect(mocks.controller.copyRenderedImage).not.toHaveBeenCalled();
  harness.root.unmount();

  const failing = renderActions(createArgs('background'), true);
  mocks.controller.copyRenderedImage.mockRejectedValueOnce(new Error('copy failed'));
  await expect(failing.result.editorActions.onCopyRenderedImage()).rejects.toThrow('copy failed');
  expect(toast.error).toHaveBeenCalledWith('editor.runtime.copyImageFailed');
  failing.root.unmount();
});
