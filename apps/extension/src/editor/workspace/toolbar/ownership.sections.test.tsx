// @vitest-environment jsdom
/* eslint-disable max-lines-per-function -- direct section routing proof stays grouped per toolbar slice */
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  createControllerMock,
  queryButtonByTitle,
  renderWithController,
} from '../../../../../../tooling/test/harness/editor/ownership/shell-helpers';

describe('editor toolbar section ownership seam', () => {
  it('covers direct toolbar section handlers through the provider-owned controller', async () => {
    const controller = createControllerMock();
    const {
      EditorToolbarCanvasSection,
      EditorToolbarPrimarySection,
      EditorToolbarWorkspaceSection,
    } = await import('./sections');
    const actions = createSectionActions();

    renderWithController(
      <>
        <EditorToolbarPrimarySection
          activeInspector="frame"
          activeTool="select"
          hasImage
          isToolButtonActive={(tool) => tool === 'select'}
          onActivateTool={actions.onActivateTool}
          onToggleInspector={actions.onToggleInspector}
        />
        <EditorToolbarCanvasSection hasImage isCropActive onActivateCrop={actions.onActivateCrop} />
        <EditorToolbarWorkspaceSection
          gridEnabled
          hasImage
          inspector="workspace"
          magnetEnabled={false}
          viewportPreviewOpen
          onToggleGrid={actions.onToggleGrid}
          onToggleMagnet={actions.onToggleMagnet}
          onToggleViewportPreview={actions.onToggleViewportPreview}
          onToggleWorkspace={actions.onToggleWorkspace}
        />
      </>,
      controller
    );

    await act(async () => {
      queryButtonByTitle(translate('editor.toolbar.file')).click();
      queryButtonByTitle(translate('editor.tools.select')).click();
      queryButtonByTitle(translate('editor.toolbar.frame')).click();
      queryButtonByTitle(translate('editor.toolbar.browserFrame')).click();
      queryButtonByTitle(translate('editor.toolbar.meta')).click();
      queryButtonByTitle(translate('editor.toolbar.resize')).click();
      queryButtonByTitle(translate('editor.toolbar.crop'), 1).click();
      queryButtonByTitle(translate('editor.toolbar.workspace')).click();
      queryButtonByTitle(translate('editor.toolbar.gridMode')).click();
      queryButtonByTitle(translate('editor.toolbar.magnetMode')).click();
      queryButtonByTitle(translate('editor.toolbar.viewportNavigation')).click();
    });

    expect(actions.onToggleInspector).toHaveBeenCalledWith('file');
    expect(actions.onToggleInspector).toHaveBeenCalledWith('frame');
    expect(
      queryButtonByTitle(translate('editor.toolbar.frame')).querySelector('svg')
    ).not.toBeNull();
    expect(actions.onToggleInspector).toHaveBeenCalledWith('browser-frame');
    expect(actions.onToggleInspector).toHaveBeenCalledWith('meta');
    expect(actions.onToggleInspector).toHaveBeenCalledWith('canvas-size');
    expect(actions.onActivateTool).toHaveBeenCalledWith('select');
    expect(actions.onActivateCrop).toHaveBeenCalledOnce();
    expect(actions.onToggleWorkspace).toHaveBeenCalledOnce();
    expect(actions.onToggleGrid).toHaveBeenCalledOnce();
    expect(actions.onToggleMagnet).toHaveBeenCalledOnce();
    expect(actions.onToggleViewportPreview).toHaveBeenCalledOnce();
  });
});

function createSectionActions() {
  return {
    onActivateCrop: vi.fn(),
    onActivateTool: vi.fn(),
    onToggleGrid: vi.fn(),
    onToggleInspector: vi.fn(),
    onToggleMagnet: vi.fn(),
    onToggleViewportPreview: vi.fn(),
    onToggleWorkspace: vi.fn(),
  };
}
