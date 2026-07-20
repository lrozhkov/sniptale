import type { EditorLayerItem } from '../../../../../apps/extension/src/features/editor/document/types';

export function createFixtureLayer(): EditorLayerItem {
  return {
    effectCount: 0,
    effects: [],
    id: 'layer-1',
    immutable: false,
    locked: false,
    name: 'Layer 1',
    previewColor: '#ff5500',
    previewDataUrl: null,
    previewTransparent: false,
    raster: false,
    selected: true,
    selectedCount: 1,
    type: 'rectangle',
    typeLabel: 'Rectangle',
    visible: true,
  };
}
