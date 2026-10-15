import { afterEach, describe, expect, it } from 'vitest';
import type { EditorLayerItem } from '../../features/editor/document/types';
import { useEditorStore } from './useEditorStore';

function createLayer(id: string): EditorLayerItem {
  return {
    id,
    name: id,
    type: 'group',
    typeLabel: 'Group',
    effectCount: 1,
    effects: [{ id: 'gamma', enabled: true, red: 1, green: 1, blue: 1 }],
    immutable: false,
    reorderable: true,
    previewColor: '#ffffff',
    previewDataUrl: null,
    previewTransparent: false,
    raster: false,
    locked: false,
    selected: false,
    selectedCount: 0,
    groupSize: 1,
    groupChildren: [{ id: 'child', name: 'Child', type: 'image', typeLabel: 'Image' }],
    visible: true,
  };
}

function publish(layers: EditorLayerItem[]) {
  useEditorStore.getState().syncRuntime({ layers, cropReady: false, cropSelection: null });
  return useEditorStore.getState().layers;
}

afterEach(() => useEditorStore.getState().resetDocumentState());

describe('runtime layer projections', () => {
  it('retains unchanged rows and avoids a layers notification for equivalent new DTOs', () => {
    const original = publish([createLayer('a'), createLayer('b')]);
    let notifications = 0;
    const stop = useEditorStore.subscribe((next, previous) => {
      if (next.layers !== previous.layers) notifications++;
    });
    try {
      expect(publish(structuredClone(original))).toBe(original);
      expect(notifications).toBe(0);
      const changed = structuredClone(original);
      changed[1]!.name = 'Renamed';
      const next = publish(changed);
      expect(next[0]).toBe(original[0]);
      expect(next[1]).toEqual(changed[1]);
      expect(next[1]).not.toBe(original[1]);
      expect(notifications).toBe(1);
    } finally {
      stop();
    }
  });

  it('publishes every changed scalar, effect value and group child field', () => {
    const changes: Array<Partial<EditorLayerItem>> = [
      { id: 'other' },
      { name: 'Other' },
      { type: 'shape' },
      { typeLabel: 'Shape' },
      { effectCount: 2 },
      { effects: [] },
      { immutable: true },
      { reorderable: false },
      { previewColor: '#000000' },
      { previewDataUrl: 'preview' },
      { previewTransparent: true },
      { raster: true },
      { locked: true },
      { selected: true },
      { selectedCount: 2 },
      { groupSize: 2 },
      { groupChildren: [] },
      { visible: false },
      { effects: [{ id: 'gamma', enabled: true, red: 2, green: 1, blue: 1 }] },
      { effects: [{ id: 'gamma', enabled: false, red: 1, green: 1, blue: 1 }] },
      { groupChildren: [{ id: 'other', name: 'Child', type: 'image', typeLabel: 'Image' }] },
      { groupChildren: [{ id: 'child', name: 'Other', type: 'image', typeLabel: 'Image' }] },
      { groupChildren: [{ id: 'child', name: 'Child', type: 'shape', typeLabel: 'Image' }] },
      { groupChildren: [{ id: 'child', name: 'Child', type: 'image', typeLabel: 'Other' }] },
    ];
    for (const change of changes) {
      const original = publish([createLayer('a')]);
      const candidate = { ...structuredClone(original[0]!), ...change };
      const next = publish([candidate]);
      expect(next[0]).toEqual(candidate);
      expect(next[0]).not.toBe(original[0]);
    }
  });

  it('retains row identities across ordering changes and removes departed document rows', () => {
    const original = publish([createLayer('a'), createLayer('b')]);
    const next = publish([
      structuredClone(original[1]!),
      structuredClone(original[0]!),
      createLayer('c'),
    ]);
    expect(next[0]).toBe(original[1]);
    expect(next[1]).toBe(original[0]);
    expect(next.map(({ id }) => id)).toEqual(['b', 'a', 'c']);
    expect(publish([structuredClone(next[2]!)]).map(({ id }) => id)).toEqual(['c']);
    useEditorStore.getState().resetDocumentState();
    expect(useEditorStore.getState().layers).toEqual([]);
  });
});
