// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  createControllerMock,
  queryButtonByTitle,
  renderWithController,
  resetEditorStore,
} from '../../../../../../tooling/test/harness/editor/ownership/shell-helpers';
import { useEditorStore } from '../../state/useEditorStore';

function queryZoomToggleButton(currentZoomPercent: number): HTMLButtonElement {
  const exactCurrentTitle = `${translate('editor.toolbar.zoomCurrentPrefix')} ${currentZoomPercent}%`;
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) =>
      candidate.textContent?.trim() === `${currentZoomPercent}%` &&
      candidate.title.includes(exactCurrentTitle)
  );

  expect(button).toBeDefined();
  if (!button) {
    throw new Error(`Expected zoom toggle button for ${currentZoomPercent}%`);
  }

  return button;
}

describe('editor toolbar layer-effects ownership', () => {
  it('keeps collapse, viewport navigation, and zoom controls exempt while layer-effects stays open', async () => {
    const controller = createControllerMock();
    const { EditorToolbar } = await import('./');

    resetEditorStore({
      activeTool: 'crop',
      inspector: 'layer-effects',
      viewportPreviewOpen: false,
    });
    renderWithController(<EditorToolbar hasImage />, controller);

    await act(async () => {
      queryButtonByTitle(translate('editor.toolbar.collapseInspector')).click();
      queryButtonByTitle(translate('editor.toolbar.viewportNavigation')).click();
      queryButtonByTitle(translate('editor.toolbar.zoomIn')).click();
      queryButtonByTitle(translate('editor.toolbar.zoomOut')).click();
      queryZoomToggleButton(125).click();
    });

    expect(controller.clearSelection).not.toHaveBeenCalled();
    expect(useEditorStore.getState().activeTool).toBe('crop');
    expect(useEditorStore.getState().inspector).toBe('layer-effects');
  });

  it('normalizes layer-effects back to tool/select for undo before the action runs', async () => {
    const controller = createControllerMock();
    const { EditorToolbar } = await import('./');

    resetEditorStore({ activeTool: 'crop', inspector: 'layer-effects' });
    renderWithController(<EditorToolbar hasImage />, controller);

    await act(async () => {
      queryButtonByTitle(translate('editor.toolbar.undo')).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(controller.clearSelection).toHaveBeenCalledOnce();
    expect(controller.undo).toHaveBeenCalledOnce();
    expect(useEditorStore.getState().activeTool).toBe('select');
    expect(useEditorStore.getState().inspector).toBe('tool');
  });
});
