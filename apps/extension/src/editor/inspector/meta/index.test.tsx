import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../chrome/tool-icons', () => ({
  RASTER_TOOL_ORDER: [],
  TOOL_ICONS: {
    arrow: 'arrow-icon',
    ellipse: 'ellipse-icon',
    image: 'image-icon',
    pencil: 'pencil-icon',
    rectangle: 'rectangle-icon',
    select: 'select-icon',
    text: 'text-icon',
  },
  TOOL_ORDER: [],
  getLayerIcon: () => null,
  getToolLabel: (tool: string) => `tool:${tool}`,
  mapObjectTypeToTool: (objectType: string | null) =>
    objectType === 'arrow' ? 'arrow' : objectType === 'image' ? 'image' : 'rectangle',
}));

import { getEditorInspectorMeta } from './';

it('uses the active layer-effects category in inspector mode metadata', () => {
  const meta = getEditorInspectorMeta({
    activeTool: 'select',
    inspector: 'layer-effects',
    isSelectionInspector: false,
    layerEffectsCategory: 'filters',
    selectedObjectType: null,
  });

  expect(meta.title).toBe('editor.toolbar.layerEffectsFilters');
  expect(meta.subtitle).toBe('editor.toolbar.layerEffectsFiltersSubtitle');
});

it('keeps single selected image layers on the normal selection metadata path', () => {
  const meta = getEditorInspectorMeta({
    activeTool: 'select',
    inspector: 'tool',
    isSelectionInspector: true,
    selectedObjectType: 'image',
  });

  expect(meta.title).toBe('editor.toolbar.selectionObjectPrefix tool:image');
  expect(meta.subtitle).toBe('editor.toolbar.selectionObjectSubtitle');
});

it('builds selection metadata for selected objects', () => {
  const arrowMeta = getEditorInspectorMeta({
    activeTool: 'select',
    inspector: 'tool',
    isSelectionInspector: true,
    selectedObjectType: 'arrow',
  });
  const shapeMeta = getEditorInspectorMeta({
    activeTool: 'select',
    inspector: 'tool',
    isSelectionInspector: true,
    selectedObjectType: 'ellipse',
  });

  expect(arrowMeta.title).toBe('editor.toolbar.selectionObjectPrefix tool:arrow');
  expect(arrowMeta.subtitle).toBe('editor.toolbar.selectionArrowSubtitle');
  expect(shapeMeta.subtitle).toBe('editor.toolbar.selectionObjectSubtitle');

  const richShapeMeta = getEditorInspectorMeta({
    activeTool: 'select',
    inspector: 'tool',
    isSelectionInspector: true,
    selectedObjectLabel: 'Decision',
    selectedObjectType: 'rich-shape',
  });
  expect(richShapeMeta.title).toBe('editor.toolbar.selectionObjectPrefix Decision');
});

it('falls back to inspector and tool titles outside selection mode', () => {
  const inspectorMeta = getEditorInspectorMeta({
    activeTool: 'select',
    inspector: 'tool',
    isSelectionInspector: false,
    selectedObjectType: null,
  });
  const toolMeta = getEditorInspectorMeta({
    activeTool: 'text',
    inspector: 'tool',
    isSelectionInspector: false,
    selectedObjectType: null,
  });

  expect(inspectorMeta.title).toBe('editor.toolbar.inspectorTitle');
  expect(toolMeta.title).toBe('editor.toolbar.toolPrefix tool:text');
  expect(toolMeta.subtitle).toBe('editor.toolbar.toolSubtitle');
});
