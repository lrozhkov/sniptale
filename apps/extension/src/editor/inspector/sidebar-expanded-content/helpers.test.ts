// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { createContentProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import {
  createEditorInspectorContentPanelProps,
  createEditorInspectorLayersPanelProps,
} from './helpers';

function createController(overrides: Record<string, unknown> = {}) {
  return {
    ...createContentProps(),
    draggedLayerId: 'dragged',
    dragOverLayerId: 'target',
    handleCloseDocument: vi.fn(),
    layers: [{ id: 'layer-1', name: 'Layer 1' }],
    layersExpanded: true,
    setDragOverLayerId: vi.fn(),
    setDraggedLayerId: vi.fn(),
    setLayersExpanded: vi.fn(),
    ...overrides,
  };
}

describe('inspector/sidebar-expanded-content helpers', () => {
  it('builds content panel props by combining core view and action seams', () => {
    const controller = createController();
    const props = createEditorInspectorContentPanelProps(true, controller as never);

    expect(props.hasImage).toBe(true);
    props.onOpenLayerEffects('layer-1', 'filters', 'blur');
    void props.applyLayerEffect('layer-1', { amount: 0.2, enabled: true, id: 'brightness' });
    props.removeLayerEffect('layer-1', 'brightness');
    props.onCloseDocument();

    expect(controller.onOpenLayerEffects).toHaveBeenCalledWith('layer-1', 'filters', 'blur');
    expect(controller.applyLayerEffect).toHaveBeenCalledWith('layer-1', {
      amount: 0.2,
      enabled: true,
      id: 'brightness',
    });
    expect(controller.removeLayerEffect).toHaveBeenCalledWith('layer-1', 'brightness');
    expect(controller.handleCloseDocument).toHaveBeenCalledOnce();
  });

  it('builds layer panel props from the sidebar controller', () => {
    const controller = createController();
    const props = createEditorInspectorLayersPanelProps(controller as never);

    expect(props.expanded).toBe(true);
    expect(props.layers).toEqual([{ id: 'layer-1', name: 'Layer 1' }]);
    expect(props.draggedLayerId).toBe('dragged');
    expect(props.dragOverLayerId).toBe('target');
    props.onOpenLayerEffects('layer-1', 'adjustments', 'brightness');
    props.setExpanded(false);
    expect(controller.onOpenLayerEffects).toHaveBeenCalledWith(
      'layer-1',
      'adjustments',
      'brightness'
    );
    expect(controller.setLayersExpanded).toHaveBeenCalledWith(false);
  });
});

it.each([true, false])(
  'forwards preview without accepting it and preserves optional actions: %s',
  (present) => {
    const preview = vi.fn();
    const commit = vi.fn();
    const action = vi.fn();
    const element = document.createElement('input');
    const input = vi.spyOn(element, 'click');
    const controller = {
      ...createController({
        setFrameDraft: commit,
        previewFrameDraft: present ? preview : undefined,
        applyImagePatch: present ? action : undefined,
        previewImagePatch: present ? action : undefined,
        insertOrUpdateBrowserFrame: present ? action : undefined,
        resetFrameDraft: present ? action : undefined,
        copyRenderedImageDisabledReason: present ? 'Unavailable' : undefined,
      }),
      layers: [],
      lastFillModeRef: { current: 'color' as const },
      requestConfirm: vi.fn(async () => true),
      openImageInputRef: { current: present ? element : null },
      importSessionInputRef: { current: present ? element : null },
      backgroundImageInputRef: { current: present ? element : null },
    } as Parameters<typeof createEditorInspectorContentPanelProps>[1];
    const props = createEditorInspectorContentPanelProps(true, controller);
    expect(props.previewFrameDraft).toBe(present ? preview : undefined);
    props.previewFrameDraft?.((frame) => ({ ...frame, paddingTop: 40 }));
    expect(preview).toHaveBeenCalledTimes(present ? 1 : 0);
    expect(commit).not.toHaveBeenCalled();
    props.onOpenImage();
    props.onImportSession();
    props.onPickBackgroundImage();
    expect(input).toHaveBeenCalledTimes(present ? 3 : 0);
    for (const key of [
      'applyImagePatch',
      'previewImagePatch',
      'insertOrUpdateBrowserFrame',
      'resetFrameDraft',
      'copyRenderedImageDisabledReason',
    ]) {
      expect(Object.hasOwn(props, key)).toBe(present);
    }
  }
);
