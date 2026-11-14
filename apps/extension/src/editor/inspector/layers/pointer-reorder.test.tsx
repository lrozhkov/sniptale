// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { useLayerPointerReorder } from './pointer-reorder';

const drop = vi.fn();
const setDragged = vi.fn();
let root: Root;
let container: HTMLDivElement;
const layers = ['a', 'b', 'c', 'source'].map((id) => ({
  id,
  selected: id === 'a',
  locked: id === 'source',
  immutable: id === 'source',
  type: id === 'source' ? 'source-image' : 'image',
})) as EditorLayerItem[];
function Harness({ items = layers }: { items?: EditorLayerItem[] }) {
  const reorder = useLayerPointerReorder({
    layers: items,
    onMove: drop,
    setDraggedLayerId: setDragged,
    setDragOverLayerId: vi.fn(),
  });
  return (
    <div data-ui="editor.layers.list-viewport">
      {reorder.layers.map((layer) => (
        <div
          key={layer.id}
          data-layer-reorder-row={layer.id}
          data-dragging={reorder.draggingId === layer.id || undefined}
        >
          <button onPointerDown={(event) => reorder.start(layer.id, event)}>{layer.id}</button>
        </div>
      ))}
    </div>
  );
}
function order() {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-layer-reorder-row]')).map(
    (el) => el.dataset['layerReorderRow']
  );
}
function pointer(type: string, y: number, id = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 20,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, 'pointerId', { value: id });
  act(() => {
    (type === 'pointerdown' ? container.querySelector('button') : window)?.dispatchEvent(event);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const index = Array.from(this.parentElement?.children ?? []).indexOf(this);
    return {
      x: 0,
      y: index * 40,
      top: index * 40,
      bottom: (index + 1) * 40,
      width: 300,
      height: 40,
      left: 0,
      right: 300,
      toJSON: () => ({}),
    };
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('previews opaque actual rows and commits exactly once on release', () => {
  pointer('pointerdown', 20);
  pointer('pointermove', 105);
  expect(order()).toEqual(['b', 'c', 'a', 'source']);
  expect(container.querySelector('[data-dragging]')?.textContent).toBe('a');
  expect(document.documentElement.hasAttribute('data-editor-layer-dragging')).toBe(true);
  expect(drop).not.toHaveBeenCalled();
  pointer('pointerup', 105);
  pointer('pointerup', 105);
  expect(drop).toHaveBeenCalledExactlyOnceWith(['a'], 'source');
  expect(document.documentElement.hasAttribute('data-editor-layer-dragging')).toBe(false);
});
it('keeps the source at the bottom and ignores another pointer', () => {
  pointer('pointerdown', 20);
  pointer('pointermove', 500, 2);
  expect(order()).toEqual(['a', 'b', 'c', 'source']);
  pointer('pointermove', 500);
  expect(order()).toEqual(['b', 'c', 'a', 'source']);
});
it('does not reorder a click or a sub-threshold move', () => {
  pointer('pointerdown', 20);
  pointer('pointermove', 22);
  pointer('pointerup', 22);
  expect(drop).not.toHaveBeenCalled();
  expect(order()).toEqual(['a', 'b', 'c', 'source']);
});
for (const reason of ['Escape', 'blur', 'pointercancel'])
  it(`cancels ${reason} without changing the document`, () => {
    pointer('pointerdown', 20);
    pointer('pointermove', 105);
    act(() =>
      window.dispatchEvent(
        reason === 'Escape'
          ? new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
          : reason === 'blur'
            ? new Event('blur')
            : Object.assign(new Event('pointercancel'), { pointerId: 1 })
      )
    );
    pointer('pointerup', 105);
    expect(order()).toEqual(['a', 'b', 'c', 'source']);
    expect(drop).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute('data-editor-layer-dragging')).toBe(false);
  });
it('cancels if the authoritative order changes mid-gesture', () => {
  pointer('pointerdown', 20);
  pointer('pointermove', 105);
  act(() => root.render(<Harness items={[layers[1]!, layers[0]!, layers[2]!, layers[3]!]} />));
  pointer('pointerup', 105);
  expect(drop).not.toHaveBeenCalled();
  expect(order()).toEqual(['b', 'a', 'c', 'source']);
});

it('moves non-adjacent selected layers together in their stacking order', () => {
  const multiple = layers.map((layer) => ({
    ...layer,
    selected: layer.id === 'a' || layer.id === 'c',
  }));
  act(() => root.render(<Harness items={multiple} />));
  pointer('pointerdown', 20);
  pointer('pointermove', 150);
  expect(order()).toEqual(['b', 'a', 'c', 'source']);
  expect(drop).not.toHaveBeenCalled();
  pointer('pointerup', 150);
  expect(drop).toHaveBeenCalledExactlyOnceWith(['a', 'c'], 'source');
});
it('refuses the whole selection if a selected layer cannot move', () => {
  act(() =>
    root.render(
      <Harness
        items={layers.map((layer) => ({
          ...layer,
          selected: layer.id === 'a' || layer.id === 'source',
        }))}
      />
    )
  );
  pointer('pointerdown', 20);
  pointer('pointermove', 150);
  pointer('pointerup', 150);
  expect(drop).not.toHaveBeenCalled();
  expect(order()).toEqual(['a', 'b', 'c', 'source']);
});

it('clears the pointer session if the controller refuses by throwing', () => {
  const error = new Error('refused');
  drop.mockImplementationOnce(() => {
    throw error;
  });
  const handleError = (event: ErrorEvent) => {
    if (event.error === error) event.preventDefault();
  };
  window.addEventListener('error', handleError);
  try {
    pointer('pointerdown', 20);
    pointer('pointermove', 105);
    pointer('pointerup', 105);
    expect(order()).toEqual(['a', 'b', 'c', 'source']);
    expect(document.documentElement.hasAttribute('data-editor-layer-dragging')).toBe(false);
    pointer('pointerdown', 20);
    pointer('pointermove', 105);
    pointer('pointerup', 105);
    expect(drop).toHaveBeenCalledTimes(2);
  } finally {
    window.removeEventListener('error', handleError);
  }
});

it('scrolls the list at its edge and stops after cancellation', () => {
  const viewport = container.querySelector<HTMLElement>('[data-ui="editor.layers.list-viewport"]')!;
  pointer('pointerdown', 20);
  pointer('pointermove', 150);
  const animation = vi.mocked(requestAnimationFrame).mock.calls[0]![0];
  act(() => animation(0));
  expect(viewport.scrollTop).toBe(8);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  act(() => animation(16));
  expect(viewport.scrollTop).toBe(8);
  expect(drop).not.toHaveBeenCalled();
});

it.each(['locked', 'selected', 'immutable', 'reorderable'] as const)(
  'cancels when the authoritative %s constraint changes',
  (field) => {
    pointer('pointerdown', 20);
    pointer('pointermove', 105);
    const items = layers.map((layer, index) =>
      index === 0 ? { ...layer, [field]: !layer[field] } : layer
    );
    act(() => root.render(<Harness items={items} />));
    pointer('pointerup', 105);
    expect(drop).not.toHaveBeenCalled();
    expect(order()).toEqual(['a', 'b', 'c', 'source']);
    expect(document.documentElement.hasAttribute('data-editor-layer-dragging')).toBe(false);
  }
);
