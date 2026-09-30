// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support/index';
import { useGalleryGridFocus } from './use-grid-focus';
import { PreviewPanel } from '../preview';
vi.mock('../preview/media', () => ({ PreviewMedia: () => null }));
vi.mock('../preview/sidebar-sections', () => ({
  PreviewActions: () => <button data-ui="gallery.preview.restore">Restore</button>,
  PreviewMetadataCards: () => null,
  PreviewProjectUsage: () => null,
  PreviewTagEditor: () => null,
}));
const noop = () => undefined;
const items = ['a', 'b', 'c'].map((id) => createMediaItem({ id, filename: id }));
let container: HTMLDivElement;
let root: Root;
let focusUnit: (id: string) => void;
function Harness(props: {
  ids?: string[];
  visible?: string[];
  preview?: boolean;
  context?: string;
  trash?: boolean;
  enabled?: boolean;
  previewItem?: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const units = (props.ids ?? ['a', 'b', 'c']).map((id) => ({
    id,
    item: items.find((item) => item.id === id)!,
    selectableIds: [id],
  }));
  const focus = useGalleryGridFocus({
    units,
    gridRef,
    metrics: { columnCount: 1, rowTops: [0, 100, 200, 300], startRow: 0, totalRows: 3 },
    viewMode: 'compact-grid',
    visibleItems: items.filter((item) => (props.visible ?? ['a', 'b', 'c']).includes(item.id)),
    enabled: props.enabled ?? !props.preview,
    previewOpen: props.preview ?? false,
    context: props.context ?? 'all',
  });
  focusUnit = focus.focusUnit;
  return (
    <>
      <button data-ui="outside">Search</button>
      <label data-ui="gallery.header.search">
        <input aria-label="Search library" />
      </label>
      <div data-ui="grid" ref={gridRef} tabIndex={-1}>
        {units
          .filter((unit) => (props.visible ?? ['a', 'b', 'c']).includes(unit.id))
          .map((unit) => (
            <article
              key={unit.id}
              data-gallery-keyboard-id={unit.id}
              tabIndex={focus.activeId === unit.id ? 0 : -1}
            >
              {unit.id}
            </article>
          ))}
      </div>
      {props.preview && props.trash ? (
        <PreviewPanel
          trashMode
          listFocusReturn
          item={items.find((item) => item.id === (props.previewItem ?? 'b'))!}
          previewUrl={null}
          inspectorCollapsed={false}
          filenameDraft="b"
          tagDraft=""
          tagDrafts={[]}
          onClose={noop}
          onInspectorToggle={noop}
          onFilenameChange={noop}
          onTagDraftChange={noop}
          onRemoveTag={noop}
          onAddTag={noop}
          onDownload={async () => undefined}
          onCopy={async () => undefined}
          onEdit={noop}
          onDelete={async () => undefined}
        />
      ) : props.preview ? (
        <div role="dialog">
          <button>Preview</button>
        </div>
      ) : null}
    </>
  );
}
function render(props: Parameters<typeof Harness>[0] = {}) {
  act(() => root.render(<Harness {...props} />));
}
function card(id: string) {
  return container.querySelector<HTMLElement>(`[data-gallery-keyboard-id="${id}"]`)!;
}
function grid() {
  return container.querySelector<HTMLDivElement>('[data-ui="grid"]')!;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  render();
  Object.defineProperty(grid(), 'clientHeight', { configurable: true, value: 100 });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('scrolls the local viewport before focusing a newly materialized offscreen card', () => {
  render({ visible: ['a'] });
  act(() => card('a').focus());
  act(() => focusUnit('c'));
  expect(grid().scrollTop).toBe(200);
  expect(document.activeElement).toBe(card('a'));
  render({ visible: ['b', 'c'] });
  expect(document.activeElement).toBe(card('c'));
  expect(document.documentElement.scrollTop).toBe(0);
});
it('preserves identity on reorder, chooses a neighbor on removal and focuses the empty viewport', () => {
  act(() => card('b').focus());
  render({ ids: ['c', 'b', 'a'] });
  expect(document.activeElement).toBe(card('b'));
  render({ ids: ['c', 'a'] });
  expect(document.activeElement).toBe(card('a'));
  render({ ids: [] });
  expect(document.activeElement).toBe(grid());
});
it('returns only after actual preview close, including an offscreen origin', () => {
  act(() => card('c').focus());
  render({ preview: true });
  act(() => container.querySelector<HTMLButtonElement>('[role="dialog"] button')?.focus());
  render({ preview: true, visible: ['a'] });
  expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
  render({ visible: ['a'] });
  expect(grid().scrollTop).toBe(200);
  render({ visible: ['b', 'c'] });
  expect(document.activeElement).toBe(card('c'));
});
it('cancels delayed focus for intentional outside focus and gives layers priority', () => {
  render({ visible: ['a'] });
  act(() => card('a').focus());
  act(() => focusUnit('c'));
  act(() => container.querySelector<HTMLButtonElement>('[data-ui="outside"]')?.focus());
  render();
  expect(document.activeElement).toBe(container.querySelector('[data-ui="outside"]'));
  act(() => card('b').focus());
  render({ preview: true });
  act(() => container.querySelector<HTMLButtonElement>('[data-ui="outside"]')?.focus());
  render();
  expect(document.activeElement).toBe(container.querySelector('[data-ui="outside"]'));
});

it('keeps the surviving material focused after Trash preview cleanup when its opener disappeared', async () => {
  act(() => card('b').focus());
  render({ preview: true, trash: true });
  expect(document.activeElement?.getAttribute('data-ui')).toBe('gallery.preview.restore');
  render({ preview: true, trash: true, previewItem: 'a', ids: ['a', 'c'] });
  await act(async () => root.render(<Harness ids={['a', 'c']} trash />));
  await Promise.resolve();
  expect(document.activeElement).toBe(card('c'));
});

it('lets the list finish materializing a virtualized Trash opener after cleanup', async () => {
  act(() => card('b').focus());
  render({ preview: true, trash: true });
  render({ preview: true, trash: true, visible: ['a'] });
  await act(async () => root.render(<Harness visible={['a']} trash />));
  await Promise.resolve();
  render({ visible: ['b', 'c'], trash: true });
  expect(document.activeElement).toBe(card('b'));
});

it('completes Trash focus return after the busy restore refresh has finished', async () => {
  act(() => card('b').focus());
  render({ preview: true, trash: true });
  await act(async () => root.render(<Harness trash enabled={false} ids={['a', 'c']} />));
  render({ trash: true, enabled: true, ids: ['a', 'c'] });
  expect(document.activeElement).toBe(card('c'));
});

it('preserves the preview opener through pointer selection in a portaled menu or listbox', () => {
  for (const role of ['listbox', 'menu']) {
    act(() => card('b').focus());
    render({ preview: true });
    const layer = document.createElement('div');
    layer.setAttribute('role', role);
    const option = document.createElement('button');
    layer.append(option);
    document.body.append(layer);
    try {
      act(() => {
        option.focus();
        option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      });
      layer.remove();
      render();
      expect(document.activeElement).toBe(card('b'));
    } finally {
      layer.remove();
    }
  }
});
