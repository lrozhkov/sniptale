// @vitest-environment jsdom
/* eslint-disable max-lines-per-function -- focused ownership flows intentionally stay in single callbacks */
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  cleanupDom,
  createControllerMock,
  queryButtonByTitle,
  renderWithController,
  resetEditorStore,
} from '../../../../../../tooling/test/harness/editor/ownership/shell-helpers';

function queryZoomToggleButton(currentZoomPercent: number): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) =>
      candidate.textContent?.trim() === `${currentZoomPercent}%` &&
      candidate.title.includes(
        `${translate('editor.toolbar.zoomCurrentPrefix')} ${currentZoomPercent}%`
      )
  );

  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

describe('editor toolbar ownership seam', () => {
  it('routes toolbar interactions through the page-owned controller instance', async () => {
    const controller = createControllerMock();
    const { EditorToolbar } = await import('./');

    renderWithController(<EditorToolbar hasImage />, controller);

    await act(async () => {
      queryButtonByTitle(translate('editor.toolbar.zoomIn')).click();
      queryButtonByTitle(translate('editor.toolbar.zoomOut')).click();
      queryButtonByTitle(translate('editor.toolbar.resetOriginal')).click();
      queryZoomToggleButton(125).click();
    });

    expect(controller.zoomIn).toHaveBeenCalledOnce();
    expect(controller.zoomOut).toHaveBeenCalledOnce();
    expect(controller.resetZoom).toHaveBeenCalledOnce();
    expect(controller.clearSelection).toHaveBeenCalledOnce();
    expect(controller.resetToOriginal).toHaveBeenCalledOnce();
    expect(document.querySelector('input[type="file"][accept="image/*"]')).toBeNull();
    expect(
      document.querySelector(`button[title="${translate('editor.toolbar.insertImage')}"]`)
    ).toBeNull();
  });

  it('renders disabled toolbar states without touching the controller when no image is loaded', async () => {
    const controller = createControllerMock();
    const {
      EditorToolbarCanvasSection,
      EditorToolbarPrimarySection,
      EditorToolbarWorkspaceSection,
      EditorToolbarZoomSection,
    } = await import('./sections');
    const { EditorToolbarUndoSection } = await import('./shared');

    resetEditorStore({
      history: { canRedo: false, canUndo: false, index: 0, size: 1 },
      imageData: null,
      selection: {
        hasSelection: false,
        selectedObjectHeight: null,
        selectedObjectCount: 0,
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedObjectType: null,
        selectedObjectWidth: null,
      },
    });
    renderWithController(
      <>
        <EditorToolbarPrimarySection
          activeInspector="tool"
          activeTool="select"
          hasImage={false}
          isToolButtonActive={() => false}
          onActivateTool={() => undefined}
          onToggleInspector={() => undefined}
        />
        <EditorToolbarUndoSection
          hasImage={false}
          history={{ canRedo: false, canUndo: false }}
          onBeforeSelectionAwareAction={() => undefined}
        />
        <EditorToolbarCanvasSection
          hasImage={false}
          isCropActive={false}
          onActivateCrop={() => undefined}
        />
        <EditorToolbarWorkspaceSection
          gridEnabled={false}
          hasImage={false}
          inspector="tool"
          magnetEnabled={false}
          viewportPreviewOpen={false}
          onToggleGrid={() => undefined}
          onToggleMagnet={() => undefined}
          onToggleViewportPreview={() => undefined}
          onToggleWorkspace={() => undefined}
        />
        <EditorToolbarZoomSection hasImage={false} zoomPercent={100} />
      </>,
      controller
    );

    expect(
      queryButtonByTitle(
        `${translate('editor.toolbar.undo')} · ${translate('editor.toolbar.undoUnavailableReason')}`
      ).disabled
    ).toBe(true);
    expect(
      queryButtonByTitle(
        `${translate('editor.toolbar.redo')} · ${translate('editor.toolbar.redoUnavailableReason')}`
      ).disabled
    ).toBe(true);
    expect(
      queryButtonByTitle(
        `${translate('editor.toolbar.file')} · ${translate('editor.toolbar.documentRequiredReason')}`
      ).disabled
    ).toBe(true);
    expect(controller.undo).not.toHaveBeenCalled();
    expect(controller.redo).not.toHaveBeenCalled();
  });

  it('toggles zoom from the current percent button without exposing extra fit or 100 controls', async () => {
    const controller = createControllerMock();
    const { EditorToolbarZoomSection } = await import('./sections');

    renderWithController(<EditorToolbarZoomSection hasImage zoomPercent={100} />, controller);

    const zoomToggleAtOneHundred = queryZoomToggleButton(100);
    expect(zoomToggleAtOneHundred.title).toContain(translate('editor.toolbar.fitToWindow'));
    expect(zoomToggleAtOneHundred.className).toContain('border-transparent bg-transparent');
    expect(zoomToggleAtOneHundred.className).not.toContain('border-none');
    expect(
      document.querySelector(`button[title="${translate('editor.toolbar.fitToWindow')}"]`)
    ).toBeNull();

    await act(async () => {
      zoomToggleAtOneHundred.click();
    });

    expect(controller.zoomToFit).toHaveBeenCalledOnce();
    expect(document.querySelector('button[title="100"]')).toBeNull();

    cleanupDom();
    renderWithController(<EditorToolbarZoomSection hasImage zoomPercent={125} />, controller);

    const zoomToggleAtCustomZoom = queryZoomToggleButton(125);
    expect(zoomToggleAtCustomZoom.title).toContain(translate('editor.toolbar.resetZoomPrefix'));

    await act(async () => {
      zoomToggleAtCustomZoom.click();
    });

    expect(controller.resetZoom).toHaveBeenCalledOnce();
  });

  it('keeps inspector summary and zoom actions exempt from selection clearing', async () => {
    const controller = createControllerMock();
    const { EditorToolbar } = await import('./');

    renderWithController(<EditorToolbar hasImage />, controller);

    await act(async () => {
      queryButtonByTitle(translate('editor.toolbar.collapseInspector')).click();
      queryButtonByTitle(translate('editor.toolbar.zoomIn')).click();
      queryButtonByTitle(translate('editor.toolbar.zoomOut')).click();
      queryZoomToggleButton(125).click();
    });

    expect(controller.clearSelection).not.toHaveBeenCalled();
  });

  it('clears selection for non-exempt toolbar actions in the full toolbar flow', async () => {
    const controller = createControllerMock();
    const { EditorToolbar } = await import('./');

    renderWithController(<EditorToolbar hasImage />, controller);

    await act(async () => {
      queryButtonByTitle(translate('editor.tools.select')).click();
      queryButtonByTitle(translate('editor.toolbar.frame')).click();
      queryButtonByTitle(translate('editor.toolbar.browserFrame')).click();
      queryButtonByTitle(translate('editor.toolbar.meta')).click();
      queryButtonByTitle(translate('editor.toolbar.crop')).click();
      queryButtonByTitle(translate('editor.toolbar.workspace')).click();
      queryButtonByTitle(translate('editor.toolbar.gridMode')).click();
    });

    expect(controller.clearSelection).toHaveBeenCalledTimes(7);
  });

  it('routes File open and repeated click through suspend and select restore', async () => {
    const controller = createControllerMock();
    const { EditorToolbar } = await import('./');

    renderWithController(<EditorToolbar hasImage />, controller);

    await act(async () => {
      queryButtonByTitle(translate('editor.toolbar.file')).click();
    });

    expect(controller.clearSelection).toHaveBeenCalledTimes(1);
    expect(controller.suspendToolMode).toHaveBeenCalledOnce();
    expect(controller.setActiveTool).not.toHaveBeenCalled();

    await act(async () => {
      queryButtonByTitle(translate('editor.toolbar.file')).click();
    });

    expect(controller.clearSelection).toHaveBeenCalledTimes(2);
    expect(controller.setActiveTool).toHaveBeenCalledWith('select');
  });
});
