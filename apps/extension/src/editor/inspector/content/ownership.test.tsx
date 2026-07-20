// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   content ownership test keeps section/render permutations in one deterministic integration-style pass */

import React from 'react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';
import {
  createControllerMock,
  renderWithController,
  cleanupDom,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import {
  createContentProps,
  createInspectorCommandParams,
} from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

describe('inspector content panels', () => {
  it('renders content and size branches for document, metrics, frame, and viewport sections', async () => {
    const controller = createControllerMock();
    const { EditorInspectorDocumentActionsSection, renderEditorInspectorContentBody } =
      await import('../content-sections');
    const {
      createResizeCanvasAction,
      createResizeImageAction,
      getCanvasSizeSectionLabel,
      getImageSizeSectionLabel,
      renderEditorInspectorFrameSection,
      renderEditorInspectorSizeSection,
    } = await import('../content-sections/size');
    const { EditorInspectorContent } = await import('.');

    const metaContentProps = createContentProps({ inspector: 'meta' }) as any;
    const documentActionsProps = createContentProps({ showDocumentActions: true }) as any;
    const confirmDialogProps = createContentProps({
      confirmDialog: {
        cancelText: 'Cancel',
        confirmText: 'Confirm',
        message: 'Close the current document?',
        title: 'Confirm close',
      },
      hasImage: false,
    }) as any;
    const setDraft = vi.fn(
      (updater: (state: { width: number; height: number }) => { width: number; height: number }) =>
        updater({ width: 1280, height: 720 })
    );
    const setLocked = vi.fn((updater: (state: boolean) => boolean) => updater(true));
    const setFrameDraft = vi.fn(
      (
        updater: (
          state: typeof DEFAULT_EDITOR_FRAME_SETTINGS
        ) => typeof DEFAULT_EDITOR_FRAME_SETTINGS
      ) => updater(DEFAULT_EDITOR_FRAME_SETTINGS)
    );

    renderWithController(
      <>
        <EditorInspectorDocumentActionsSection
          canvasSize={{ height: 720, width: 1280 }}
          savePresets={createInspectorCommandParams().savePresets}
          defaultImagePresetId="preset-default"
          saveToPreset={vi.fn(async () => undefined)}
          onSaveImage={vi.fn(async () => undefined)}
          onSaveImageAs={vi.fn(async () => undefined)}
          onCopyRenderedImage={vi.fn()}
          onOpenImage={vi.fn()}
          onCloseDocument={vi.fn()}
          onExportSession={vi.fn()}
          onImportSession={vi.fn()}
        />
      </>,
      controller
    );

    expect(getImageSizeSectionLabel()).toBe(translate('editor.compact.imageSize'));
    expect(getCanvasSizeSectionLabel()).toBe(translate('editor.compact.canvasSize'));
    createResizeImageAction(controller as never, 640, 480)();
    createResizeCanvasAction(controller as never, 800, 600)();
    expect(controller.resizeImage).toHaveBeenCalledWith(640, 480);
    expect(controller.resizeCanvas).toHaveBeenCalledWith(800, 600);

    cleanupDom();
    controller.resizeCanvas.mockClear();
    renderWithController(
      renderEditorInspectorContentBody(
        createContentProps({
          canvasSize: { height: 600, width: 800 },
          cropReady: false,
          inspector: 'image-size',
        }) as never,
        controller as never
      ),
      controller as never
    );
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .filter((button) => button.textContent?.includes(translate('editor.compact.apply')))
        .forEach((button) => button.click());
    });
    expect(controller.resizeCanvas).toHaveBeenCalledWith(1280, 720);

    cleanupDom();
    controller.resizeCanvas.mockClear();
    renderWithController(
      renderEditorInspectorContentBody(
        createContentProps({
          canvasSize: { height: 600, width: 800 },
          cropReady: false,
          inspector: 'canvas-size',
        }) as never,
        controller as never
      ),
      controller as never
    );
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .filter((button) => button.textContent?.includes(translate('editor.compact.apply')))
        .forEach((button) => button.click());
    });
    expect(controller.resizeCanvas).toHaveBeenCalledWith(1280, 720);

    cleanupDom();
    const sizePanel = renderEditorInspectorSizeSection({
      aspectRatio: 16 / 9,
      draft: { height: 720, width: 1280 },
      label: 'Image',
      locked: true,
      onApply: vi.fn(),
      setDraft: setDraft as never,
      setLocked: setLocked as never,
      updateLockedDraft: (
        state: { width: number; height: number },
        field: 'width' | 'height',
        value: number
      ) => ({
        ...state,
        [field]: value,
      }),
      valueText: '1280 x 720',
    }) as React.ReactElement<any>;
    sizePanel.props.onWidthChange(640);
    sizePanel.props.onHeightChange(480);
    sizePanel.props.onToggleLock();

    renderWithController(sizePanel, controller);
    expect(setDraft).toHaveBeenCalled();
    expect(setLocked).toHaveBeenCalled();

    cleanupDom();
    renderWithController(
      renderEditorInspectorFrameSection({
        applyGradientPreset: vi.fn(),
        backgroundPreviewStyle: {},
        clearBackgroundImage: vi.fn(),
        frameBackgroundImageFitOptions: [{ label: 'Cover', value: 'cover' }],
        frameBackgroundModeOptions: [{ label: 'Color', value: 'color' }],
        frameBackgroundPalette: ['#ffffff'],
        frameDraft: DEFAULT_EDITOR_FRAME_SETTINGS,
        frameGradientPresets: [
          { angle: 90, from: '#111111', id: 'preset', label: 'Preset', to: '#ffffff' },
        ],
        frameLayoutModeOptions: [{ label: 'Expand', value: 'expand-canvas' }],
        framePaddingSummary: '12 / 12 / 12 / 12',
        onApplyFrame: vi.fn(),
        onPickBackgroundImage: vi.fn(),
        recentColors: ['#111111'],
        scenePresetHeader: null,
        setFrameDraft: setFrameDraft as never,
        toNumber: (value: string) => Number(value),
      }),
      controller
    );

    cleanupDom();
    renderWithController(
      renderEditorInspectorContentBody(
        createContentProps({ inspector: 'frame' }) as never,
        controller as never
      ),
      controller as never
    );

    cleanupDom();
    renderWithController(<EditorInspectorContent {...metaContentProps} />, controller);
    cleanupDom();
    renderWithController(<EditorInspectorContent {...confirmDialogProps} />, controller);
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .filter((button) => ['Confirm', 'Cancel'].includes(button.textContent ?? ''))
        .forEach((button) => button.click());
    });

    cleanupDom();
    renderWithController(<EditorInspectorContent {...documentActionsProps} />, controller);
    expect(confirmDialogProps.onConfirmDialogConfirm).toHaveBeenCalledOnce();
    expect(confirmDialogProps.onConfirmDialogCancel).toHaveBeenCalledOnce();
  }, 15_000);
});
