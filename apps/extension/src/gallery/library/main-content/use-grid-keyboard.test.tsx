// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support/index';
import { resolveGallerySelectionRange } from '../keyboard/selection-range';
import { useGalleryGridKeyboard } from './use-grid-keyboard';

const items = ['a', 'b', 'c', 'd'].map((id) => createMediaItem({ id, filename: id }));
const preview = vi.fn();
let container: HTMLDivElement;
let root: Root;
function Harness(props: { context?: string; enabled?: boolean }) {
  const gridViewportRef = useRef<HTMLDivElement>(null);
  const [selectedIds, select] = useState(new Set(['d']));
  const keyboard = useGalleryGridKeyboard({
    filteredItems: items,
    visibleItems: items,
    viewMode: 'list',
    gridMetrics: { columnCount: 1, rowTops: [0, 100, 200, 300, 400], startRow: 0, totalRows: 4 },
    gridViewportRef,
    keyboardEnabled: props.enabled ?? true,
    previewOpen: false,
    navigationContext: props.context ?? 'all',
    selectedIds,
    onPreviewOpen: preview,
    onToggleSelection: (id) =>
      select((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    onSelectRange: (range) => {
      const next =
        resolveGallerySelectionRange(range, new Set(items.map((item) => item.id))) ?? selectedIds;
      select(next);
      return next;
    },
  });
  return (
    <>
      <button data-ui="outside" onClick={() => select(new Set())}>
        Clear
      </button>
      <output>{[...selectedIds].sort().join(',')}</output>
      <div ref={gridViewportRef} onKeyDown={keyboard.onKeyDown} tabIndex={-1}>
        {items.map((item) => (
          <article
            key={item.id}
            data-gallery-keyboard-id={item.id}
            tabIndex={keyboard.navigation.activeId === item.id ? 0 : -1}
          >
            {item.filename}
            <button onClick={() => keyboard.onPointerToggle(item.id)}>Select {item.id}</button>
          </article>
        ))}
      </div>
    </>
  );
}
function render(props: Parameters<typeof Harness>[0] = {}) {
  act(() => root.render(<Harness {...props} />));
}
function card(id: string) {
  return container.querySelector<HTMLElement>(`[data-gallery-keyboard-id="${id}"]`)!;
}
function press(key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: key === ' ' ? 'Space' : key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  act(() => document.activeElement?.dispatchEvent(event));
  return event;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  preview.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  render();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('uses roving wrapper focus, repeated arrows and one-shot Space/Enter without changing nested controls', () => {
  expect(card('a').tabIndex).toBe(0);
  expect(card('b').tabIndex).toBe(-1);
  act(() => card('a').focus());
  expect(press('ArrowDown').defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(card('b'));
  press('ArrowDown', { repeat: true });
  expect(document.activeElement).toBe(card('c'));
  press(' ');
  expect(container.querySelector('output')?.textContent).toBe('c,d');
  press(' ', { repeat: true });
  expect(container.querySelector('output')?.textContent).toBe('c,d');
  press('Enter');
  press('Enter', { repeat: true });
  expect(preview).toHaveBeenCalledExactlyOnceWith(items[2]);
  act(() => card('c').querySelector('button')?.focus());
  expect(press('ArrowDown').defaultPrevented).toBe(false);
  expect(press(' ').defaultPrevented).toBe(false);
  press('End');
  expect(document.activeElement).toBe(card('c').querySelector('button'));
});
it('extends, contracts and crosses one fixed range anchor while retaining unrelated selection', () => {
  act(() => card('b').focus());
  press('ArrowDown', { shiftKey: true });
  expect(container.querySelector('output')?.textContent).toBe('b,c,d');
  press('ArrowUp', { shiftKey: true });
  expect(container.querySelector('output')?.textContent).toBe('b,d');
  press('ArrowUp', { shiftKey: true });
  expect(container.querySelector('output')?.textContent).toBe('a,b,d');
  press('ArrowDown');
  press('ArrowDown', { shiftKey: true });
  expect(container.querySelector('output')?.textContent).toBe('a,b,c,d');
});
it('resets the gesture after external selection, pointer commands and context changes', () => {
  act(() => card('b').focus());
  press('ArrowDown', { shiftKey: true });
  act(() => container.querySelector<HTMLButtonElement>('[data-ui="outside"]')?.click());
  press('ArrowUp', { shiftKey: true });
  expect(container.querySelector('output')?.textContent).toBe('b,c');
  render({ context: 'filtered' });
  press('ArrowUp', { shiftKey: true });
  expect(container.querySelector('output')?.textContent).toBe('a,b,c');
  act(() => card('d').querySelector('button')?.click());
  press('ArrowDown', { shiftKey: true });
  expect(container.querySelector('output')?.textContent).toBe('a,b,c,d');
});
it('does not run behind a menu, with modifiers, IME or disabled interaction', () => {
  act(() => card('a').focus());
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  expect(press('ArrowDown').defaultPrevented).toBe(false);
  menu.remove();
  expect(press('ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(press('ArrowDown', { isComposing: true }).defaultPrevented).toBe(false);
  render({ enabled: false });
  expect(press('ArrowDown').defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(card('a'));
});
