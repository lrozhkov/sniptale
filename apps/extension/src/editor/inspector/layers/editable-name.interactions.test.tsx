// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { LayerName, useEditableLayerName } from './editable-name';

const renameLayer = vi.hoisted(() => vi.fn());
vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal()),
  useEditorController: () => ({ renameLayer }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  renameLayer.mockReset();
});

it('clears a layer name draft without accepting it and keeps keyboard focus for replacement', () => {
  const layer: EditorLayerItem = {
    id: 'layer-1',
    name: 'Rectangle',
    type: 'shape',
    typeLabel: 'Rectangle',
    visible: true,
    locked: false,
    selected: true,
    selectedCount: 1,
    raster: false,
    previewColor: '#fff',
    previewDataUrl: null,
    previewTransparent: false,
    effects: [],
    effectCount: 0,
  };
  function Harness() {
    const editableName = useEditableLayerName(layer);
    return (
      <>
        <button onClick={editableName.startEditing}>Rename</button>
        <LayerName editableName={editableName} layer={layer} />
      </>
    );
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <CommandPressScope.Provider value>
        <Harness />
      </CommandPressScope.Provider>
    )
  );
  act(() => container?.querySelector('button')?.click());
  const input = container.querySelector('input');
  expect(input).not.toBeNull();
  const clear = container.querySelector<HTMLButtonElement>('.sniptale-field-clear');
  expect(clear).not.toBeNull();
  act(() => clear?.click());
  expect(input?.value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(renameLayer).not.toHaveBeenCalled();
  expect(container.querySelector('.sniptale-field-clear')).toBeNull();
  act(() => input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(container.textContent).toContain('Rectangle');
  expect(renameLayer).not.toHaveBeenCalled();
});
