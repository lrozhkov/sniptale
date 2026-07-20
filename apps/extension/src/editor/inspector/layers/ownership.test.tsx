// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   layer ownership test keeps drag/drop and toolbar orchestration in single focused scenarios */

import React from 'react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  cleanupDom,
  createControllerMock,
  renderWithController,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { useEditorStore } from '../../state/useEditorStore';

describe('editor layer sidebars', () => {
  it('covers layer list orchestration branches through the provider-owned controller', async () => {
    const controller = createControllerMock();
    const { EditorInspectorToolsPanel } = await import('../tools');
    const { EditorInspectorLayersHeader, EditorInspectorLayersList } = await import('./header');
    const { EditorInspectorLayersPanel } = await import('.');
    const { createToolsPanelProps } =
      await import('../../../../../../tooling/test/harness/editor/ownership/fixtures');

    const onToggle = vi.fn();
    const setDraggedLayerId = vi.fn();
    const setDragOverLayerId = vi.fn();
    const onDrop = vi.fn();
    const setExpanded = vi.fn();
    const layersHeader = (
      <EditorInspectorLayersHeader expanded layerCount={2} onToggle={onToggle} />
    ) as React.ReactElement<any>;

    layersHeader.props.onToggle();

    renderWithController(
      <>
        <EditorInspectorToolsPanel
          {...(createToolsPanelProps({ highlightedTool: 'rectangle' }) as any)}
        />
        <EditorInspectorToolsPanel
          {...(createToolsPanelProps({ highlightedTool: 'arrow' }) as any)}
        />
        <EditorInspectorToolsPanel
          {...(createToolsPanelProps({ highlightedTool: 'text' }) as any)}
        />
        <EditorInspectorToolsPanel
          {...(createToolsPanelProps({ highlightedTool: 'select' }) as any)}
        />
        <EditorInspectorLayersList
          layers={useEditorStore.getState().layers}
          dragOverLayerId={null}
          setDraggedLayerId={setDraggedLayerId as never}
          setDragOverLayerId={setDragOverLayerId as never}
          onDrop={onDrop}
          onOpenLayerEffects={vi.fn()}
        />
        <EditorInspectorLayersPanel
          expanded
          layers={useEditorStore.getState().layers}
          selectedObjectCount={1}
          draggedLayerId="source-image"
          dragOverLayerId={null}
          onOpenLayerEffects={vi.fn()}
          setExpanded={setExpanded as never}
          setDraggedLayerId={setDraggedLayerId as never}
          setDragOverLayerId={setDragOverLayerId as never}
        />
      </>,
      controller
    );

    const layerTrigger = document.querySelector<HTMLButtonElement>('button[title="Layer 1"]');
    const layerRow = layerTrigger?.parentElement;
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.title === translate('editor.toolbar.layersTitle'))
        ?.click();
      layerTrigger?.click();
      layerTrigger?.dispatchEvent(new Event('dragstart', { bubbles: true }));
      const dragOverEvent = new Event('dragover', { bubbles: true });
      Object.defineProperty(dragOverEvent, 'preventDefault', { value: vi.fn() });
      layerRow?.dispatchEvent(dragOverEvent);
      const dropEvent = new Event('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn() });
      layerRow?.dispatchEvent(dropEvent);
      layerTrigger?.dispatchEvent(new Event('dragend', { bubbles: true }));
    });

    expect(onToggle).toHaveBeenCalledOnce();
    expect(controller.selectLayer).toHaveBeenCalledWith('layer-1', {
      additive: false,
      focusViewport: false,
      range: false,
      toggle: false,
    });
    expect(setDraggedLayerId).toHaveBeenCalled();
    expect(setDragOverLayerId).toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledWith('layer-1');
    expect(setExpanded).toHaveBeenCalled();
  }, 15_000);

  it('renders layer panels and dedicated sidebar sections through the provider-owned controller', async () => {
    const controller = createControllerMock();
    const { EditorInspectorLayersPanel } = await import('.');
    const { EditorInspectorLayersHeader, EditorInspectorLayersList } = await import('./header');

    renderWithController(
      <>
        <EditorInspectorLayersPanel
          expanded
          layers={useEditorStore.getState().layers}
          selectedObjectCount={1}
          draggedLayerId={null}
          dragOverLayerId={null}
          onOpenLayerEffects={vi.fn()}
        />
        <EditorInspectorLayersHeader expanded={false} layerCount={0} onToggle={vi.fn()} />
      </>,
      controller
    );

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          `button[title="${translate('editor.toolbar.frontLayer')}"]`
        )
        ?.click();
      document
        .querySelector<HTMLButtonElement>(
          `button[title="${translate('editor.toolbar.raiseSelection')}"]`
        )
        ?.click();
      document
        .querySelector<HTMLButtonElement>(
          `button[title="${translate('editor.toolbar.lowerSelection')}"]`
        )
        ?.click();
      document
        .querySelector<HTMLButtonElement>(
          `button[title="${translate('editor.toolbar.backLayer')}"]`
        )
        ?.click();
      document
        .querySelector<HTMLButtonElement>(
          `button[title="${translate('editor.toolbar.duplicateLayer')}"]`
        )
        ?.click();
      document
        .querySelector<HTMLButtonElement>(
          `button[title="${translate('editor.toolbar.deleteLayer')}"]`
        )
        ?.click();
    });

    expect(controller.bringSelectionToFront).toHaveBeenCalledOnce();
    expect(controller.bringForwardSelection).toHaveBeenCalled();
    expect(controller.sendBackwardSelection).toHaveBeenCalled();
    expect(controller.sendSelectionToBack).toHaveBeenCalledOnce();
    expect(controller.duplicateSelection).toHaveBeenCalledOnce();
    expect(controller.deleteSelection).toHaveBeenCalledOnce();

    cleanupDom();
    renderWithController(
      <EditorInspectorLayersPanel
        expanded
        layers={
          [
            { ...useEditorStore.getState().layers[0], selected: true },
            {
              ...useEditorStore.getState().layers[0],
              id: 'layer-2',
              immutable: false,
              name: 'Layer 2',
              selected: true,
              type: 'ellipse',
            },
          ] as never
        }
        selectedObjectCount={2}
        draggedLayerId={null}
        dragOverLayerId={null}
        onOpenLayerEffects={vi.fn()}
      />,
      controller
    );

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          `button[title="${translate('editor.toolbar.mergeLayers')}"]`
        )
        ?.click();
    });

    expect(controller.mergeSelectedLayers).toHaveBeenCalledOnce();

    cleanupDom();
    renderWithController(
      <EditorInspectorLayersPanel
        expanded
        layers={[]}
        selectedObjectCount={0}
        draggedLayerId={null}
        dragOverLayerId={null}
        onOpenLayerEffects={vi.fn()}
      />,
      controller
    );
    expect(document.body.textContent).toContain(translate('editor.toolbar.noLayers'));

    cleanupDom();
    renderWithController(
      <EditorInspectorLayersList
        layers={
          [
            {
              id: 'layer-locked',
              immutable: false,
              locked: true,
              name: 'Locked layer',
              selected: false,
              type: 'rectangle',
              visible: false,
            },
          ] as never
        }
        dragOverLayerId={null}
        setDraggedLayerId={vi.fn() as never}
        setDragOverLayerId={vi.fn() as never}
        onDrop={vi.fn()}
        onOpenLayerEffects={vi.fn()}
      />,
      controller
    );

    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .filter((button) =>
          [translate('editor.toolbar.showLayer'), translate('editor.toolbar.unlockLayer')].includes(
            button.title
          )
        )
        .forEach((button) => button.click());
    });

    expect(controller.toggleLayerVisibility).not.toHaveBeenCalledWith('layer-locked');
    expect(controller.toggleLayerLock).toHaveBeenCalledWith('layer-locked');

    cleanupDom();
    renderWithController(
      <EditorInspectorLayersList
        layers={
          [
            {
              id: 'source-image',
              immutable: true,
              locked: true,
              name: 'Source',
              selected: false,
              type: 'source-image',
              visible: true,
            },
          ] as never
        }
        dragOverLayerId={null}
        setDraggedLayerId={vi.fn() as never}
        setDragOverLayerId={vi.fn() as never}
        onDrop={vi.fn()}
        onOpenLayerEffects={vi.fn()}
      />,
      controller
    );

    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .filter((button) =>
          [translate('editor.toolbar.hideLayer'), translate('editor.toolbar.unlockLayer')].includes(
            button.title
          )
        )
        .forEach((button) => button.click());
    });

    expect(controller.toggleLayerVisibility).not.toHaveBeenCalledWith('source-image');
    expect(controller.toggleLayerLock).toHaveBeenCalledWith('source-image');
  });
});
