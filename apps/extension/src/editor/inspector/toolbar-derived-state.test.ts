import { expect, it } from 'vitest';
import { translate } from '../../platform/i18n';

import { getEditorToolbarDerivedState } from './toolbar-derived-state';

it('keeps the selected tool button active outside tool inspector mode', () => {
  const state = getEditorToolbarDerivedState({
    activeTool: 'rectangle',
    inspector: 'frame',
    selection: {
      hasSelection: false,
      selectedObjectCount: 0,
      selectedObjectId: null,
      selectedObjectType: null,
    },
  });

  expect(state.isToolButtonActive('rectangle')).toBe(true);
  expect(state.isToolButtonActive('select')).toBe(false);
  expect(state.isToolMode).toBe(false);
});

it('keeps the Cursor button inactive while the File inspector owns the UI', () => {
  const state = getEditorToolbarDerivedState({
    activeTool: 'select',
    inspector: 'file',
    selection: {
      hasSelection: false,
      selectedObjectCount: 0,
      selectedObjectId: null,
      selectedObjectType: null,
    },
  });

  expect(state.isToolButtonActive('select')).toBe(false);
  expect(state.isToolMode).toBe(false);
});

it('keeps selection-derived highlight logic intact for selected objects', () => {
  const state = getEditorToolbarDerivedState({
    activeTool: 'select',
    inspector: 'tool',
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'shape-1',
      selectedObjectType: 'arrow',
    },
  });

  expect(state.highlightedTool).toBe('arrow');
  expect(state.isToolButtonActive('select')).toBe(true);
});

it('keeps single selected image layers on the normal selection inspector path', () => {
  const state = getEditorToolbarDerivedState({
    activeTool: 'select',
    inspector: 'tool',
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'image-layer',
      selectedObjectType: 'image',
    },
  });

  expect(state.highlightedTool).toBe('image');
  expect(state.inspectorMeta.title).toContain(translate('editor.toolbar.selectionObjectPrefix'));
  expect(state.inspectorMeta.subtitle).toBe(translate('editor.toolbar.selectionObjectSubtitle'));
  expect(state.inspectorMeta.title).not.toBe(translate('editor.toolbar.layerSizeTitle'));
});

it('does not switch the toolbar into the resizable-layer branch for source-image selections', () => {
  const state = getEditorToolbarDerivedState({
    activeTool: 'select',
    inspector: 'tool',
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'source-layer',
      selectedObjectType: 'source-image',
    },
  });

  expect(state.highlightedTool).toBe('image');
  expect(state.inspectorMeta.title).not.toBe('editor.toolbar.layerSizeTitle');
});

it('uses the imported rich shape label in selected-object toolbar metadata', () => {
  const state = getEditorToolbarDerivedState({
    activeTool: 'select',
    inspector: 'tool',
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'shape-1',
      selectedObjectLabel: 'Decision flow',
      selectedObjectType: 'rich-shape',
    },
  });

  expect(state.highlightedTool).toBe('shapes-and-lines');
  expect(state.inspectorMeta.title).toContain('Decision flow');
});
