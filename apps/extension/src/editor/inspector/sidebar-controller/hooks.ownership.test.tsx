// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   sidebar hook ownership tests keep provider-wired branches together to avoid brittle mock setup duplication */

import React, { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  createControllerMock,
  flushAsyncWork,
  getEditorInspectorOwnershipMocks,
  renderWithControllerAsync,
  rerenderWithControllerAsync,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

const rememberRecentColorMock = vi.hoisted(() => vi.fn(async () => undefined));

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

vi.mock('./save-options', () => ({
  useInspectorSidebarSaveOptionsState: () => ({
    defaultImagePresetId: 'preset-default',
    savePresets: createInspectorCommandParams().savePresets,
  }),
}));

describe('sidebar hooks', () => {
  it('routes sidebar action hook branches without an image through the provider-owned controller', async () => {
    const { toastErrorMock } = getEditorInspectorOwnershipMocks();
    const controller = createControllerMock();
    const { useEditorInspectorSidebarActions } = await import('./actions');
    let actions: ReturnType<typeof useEditorInspectorSidebarActions> | null = null;
    const setBrowserFrame = vi.fn();

    const Harness: React.FC<{ hasImage: boolean }> = ({ hasImage }) => {
      actions = useEditorInspectorSidebarActions(
        {
          activeTool: 'select',
          browserFrame: DEFAULT_BROWSER_FRAME_STATE,
          confirmOpenStorageManager: vi.fn(async () => false),
          defaultImagePresetId: 'preset-default',
          savePresets: createInspectorCommandParams().savePresets,
          selection: createInspectorCommandParams().selection as never,
          setFrameDraft: vi.fn() as never,
          setBrowserFrame,
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
        hasImage
      );

      return null;
    };

    await renderWithControllerAsync(<Harness hasImage={false} />, controller);
    expect(actions).not.toBeNull();
    actions!.applyArrowPatch({ color: '#111111' } as never);
    actions!.applyBrushPatch('pencil', { color: '#222222' } as never);
    actions!.applyShapePatch({ strokeColor: '#333333' } as never);
    actions!.applyStepPatch({ value: '2' } as never);
    actions!.applyTextPatch({ fontSize: 24 } as never);
    actions!.onApplyFrame();
    await actions!.onCopyRenderedImage();
    await actions!.syncBrowserFrame({ enabled: true });

    expect(controller.applyActiveSettingsToSelection).toHaveBeenCalledTimes(5);
    expect(actions!.copyRenderedImageDisabledReason).toBeNull();
    expect(controller.removeBrowserFrame).not.toHaveBeenCalled();
    expect(controller.applyBrowserFrame).not.toHaveBeenCalled();
    expect(controller.applyFrameSettings).toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(setBrowserFrame).toHaveBeenCalled();
  });

  it('routes sidebar action hook branches with an image through the provider-owned controller', async () => {
    const { toastErrorMock } = getEditorInspectorOwnershipMocks();
    const controller = createControllerMock();
    const { useEditorInspectorSidebarActions } = await import('./actions');
    let actions: ReturnType<typeof useEditorInspectorSidebarActions> | null = null;

    const Harness: React.FC = () => {
      actions = useEditorInspectorSidebarActions(
        {
          activeTool: 'select',
          browserFrame: DEFAULT_BROWSER_FRAME_STATE,
          confirmOpenStorageManager: vi.fn(async () => false),
          defaultImagePresetId: 'preset-default',
          savePresets: createInspectorCommandParams().savePresets,
          selection: createInspectorCommandParams().selection as never,
          setFrameDraft: vi.fn() as never,
          setBrowserFrame: vi.fn(),
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
        true
      );

      return null;
    };

    await renderWithControllerAsync(<Harness />, controller);
    await actions!.syncBrowserFrame({ title: 'Header title' });
    await actions!.insertOrUpdateBrowserFrame?.();
    await actions!.onCopyRenderedImage();
    controller.copyRenderedImage = vi.fn(async () => {
      throw new Error('copy failed');
    });
    await expect(actions!.onCopyRenderedImage()).rejects.toThrow();

    expect(controller.applyBrowserFrame).toHaveBeenCalled();
    expect(actions!.copyRenderedImageDisabledReason).toBeNull();
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('routes sidebar controller actions and close-document lifecycle without a global singleton', async () => {
    const controller = createControllerMock();
    const { useEditorInspectorSidebarController } = await import('.');
    let sidebarController: ReturnType<typeof useEditorInspectorSidebarController> | null = null;

    const Harness: React.FC<{ hasImage: boolean }> = ({ hasImage }) => {
      sidebarController = useEditorInspectorSidebarController(hasImage);
      return null;
    };

    await renderWithControllerAsync(<Harness hasImage={false} />, controller);
    expect(sidebarController).not.toBeNull();

    const openImageInput = document.createElement('input');
    const importSessionInput = document.createElement('input');
    const backgroundInput = document.createElement('input');
    const openImageClick = vi.spyOn(openImageInput, 'click').mockImplementation(() => undefined);
    const importSessionClick = vi
      .spyOn(importSessionInput, 'click')
      .mockImplementation(() => undefined);
    const backgroundClick = vi.spyOn(backgroundInput, 'click').mockImplementation(() => undefined);

    (sidebarController!.openImageInputRef as { current: HTMLInputElement | null }).current =
      openImageInput;
    (sidebarController!.importSessionInputRef as { current: HTMLInputElement | null }).current =
      importSessionInput;
    (sidebarController!.backgroundImageInputRef as { current: HTMLInputElement | null }).current =
      backgroundInput;

    await act(async () => sidebarController!.handleCloseDocument());
    sidebarController!.onOpenImage();
    sidebarController!.onImportSession();
    sidebarController!.onPickBackgroundImage();
    sidebarController!.onResizeCanvas(500, 400);
    sidebarController!.onResizeImage(400, 300);
    let resizeLayerPromise = Promise.resolve();
    await act(async () => {
      resizeLayerPromise = Promise.resolve(sidebarController!.onResizeLayer('layer-1', 120, 100));
    });
    await flushAsyncWork();
    await act(async () => sidebarController!.onConfirmDialogConfirm());
    await resizeLayerPromise;
    sidebarController!.onApplyFrame();

    expect(controller.closeDocument).toHaveBeenCalled();
    expect(controller.resizeCanvas).toHaveBeenCalledWith(500, 400);
    expect(controller.resizeImage).toHaveBeenCalledWith(400, 300);
    expect(controller.resizeLayer).toHaveBeenCalledWith('layer-1', 120, 100);
    expect(controller.applyFrameSettings).toHaveBeenCalled();
    expect(openImageClick).toHaveBeenCalledOnce();
    expect(importSessionClick).toHaveBeenCalledOnce();
    expect(backgroundClick).toHaveBeenCalledOnce();
    expect(sidebarController!.compactCommandGroups.length).toBeGreaterThan(0);

    await rerenderWithControllerAsync(<Harness hasImage />, controller);
    await act(async () => sidebarController!.handleCloseDocument());
    await flushAsyncWork();
    await act(async () => sidebarController!.onConfirmDialogCancel());
    await act(async () => sidebarController!.handleCloseDocument());
    await flushAsyncWork();
    await act(async () => sidebarController!.onConfirmDialogConfirm());
    await flushAsyncWork();
    expect(controller.closeDocument).toHaveBeenCalled();
  });
});
