// @vitest-environment jsdom
import { act, useState } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TextDocument } from './text-document';
let host: HTMLDivElement;
let root: Root;
const activate = vi.fn();
const selection = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  activate.mockClear();
  selection.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.getSelection()?.removeAllRanges();
  vi.unstubAllGlobals();
});
function mount(
  phrases = [
    { id: 'a', text: 'First phrase.\n' },
    { id: 'b', text: 'Second phrase.' },
    { id: 'c', text: 'Third phrase.', unavailable: true },
  ]
) {
  function Harness() {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <TextDocument
        label="Document"
        phrases={phrases}
        selectedIds={selected}
        onSelection={(ids) => {
          selection(ids);
          setSelected(ids);
        }}
        onActivate={activate}
      />
    );
  }
  act(() => root.render(<Harness />));
}
function phrase(id: string) {
  return host.querySelector<HTMLElement>(`[data-text-phrase-id="${id}"]`)!;
}
function pointer(id: string, type: string, x: number, y: number) {
  act(() =>
    phrase(id).dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: y,
      })
    )
  );
}
it('renders the full document and retains authored whitespace with connected wrapping text', () => {
  mount(
    Array.from({ length: 56 }, (_, index) => ({
      id: String(index),
      text: index === 0 ? 'First\n\nline ' : `Phrase ${index}.`,
    }))
  );
  expect(host.querySelectorAll('[data-text-phrase-id]')).toHaveLength(56);
  expect(host.textContent).toContain('First\n\nline Phrase 1. Phrase 2.');
  expect(host.textContent).toContain('Phrase 55.');
  expect(host.querySelector('[data-ui="text-document"]')?.className).toContain(
    'whitespace-pre-wrap'
  );
});
it('activates a whole phrase by click or keyboard and keeps unavailable text selectable', () => {
  mount();
  act(() => phrase('a').click());
  expect(activate).toHaveBeenLastCalledWith('a');
  for (const key of ['Enter', ' '])
    act(() => phrase('b').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  expect(activate).toHaveBeenCalledTimes(3);
  act(() => phrase('c').click());
  expect(activate).toHaveBeenCalledTimes(3);
  expect(selection).toHaveBeenLastCalledWith(['c']);
});
it('selects contiguous or explicit nonadjacent IDs without seeking on modifier gestures', () => {
  mount();
  act(() => phrase('a').click());
  activate.mockClear();
  act(() => phrase('b').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true })));
  expect(selection).toHaveBeenLastCalledWith(['a', 'b']);
  act(() => phrase('b').dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true })));
  act(() => phrase('c').dispatchEvent(new MouseEvent('click', { metaKey: true, bubbles: true })));
  expect(selection).toHaveBeenLastCalledWith(['a', 'c']);
  expect(activate).not.toHaveBeenCalled();
});
it('preserves the native range and Copy while selecting only text-overlapping phrase IDs', () => {
  mount();
  pointer('a', 'pointerdown', 10, 10);
  const range = document.createRange();
  range.setStart(phrase('a').firstChild!, 3);
  range.setEnd(phrase('c').firstChild!, 0);
  document.getSelection()!.addRange(range);
  const copied = document.getSelection()!.toString();
  pointer('b', 'pointermove', 40, 10);
  pointer('b', 'pointerup', 40, 10);
  expect(selection).toHaveBeenLastCalledWith(['a', 'b']);
  act(() => phrase('b').click());
  expect(activate).not.toHaveBeenCalled();
  const copy = new Event('copy', { bubbles: true, cancelable: true });
  act(() => phrase('b').dispatchEvent(copy));
  expect(copy.defaultPrevented).toBe(false);
  expect(document.getSelection()!.toString()).toBe(copied);
  expect(document.getSelection()!.getRangeAt(0)).toBe(range);
});

it('activates a plain click after Copy and toggles a phrase without reusing the old native range', () => {
  mount();
  pointer('a', 'pointerdown', 10, 10);
  const range = document.createRange();
  range.setStart(phrase('a').firstChild!, 3);
  range.setEnd(phrase('b').firstChild!, 5);
  document.getSelection()!.addRange(range);
  const copied = range.toString();
  pointer('b', 'pointermove', 40, 10);
  pointer('b', 'pointerup', 40, 10);
  act(() => phrase('b').click());
  const copy = new Event('copy', { bubbles: true, cancelable: true });
  act(() => phrase('b').dispatchEvent(copy));
  expect(selection).toHaveBeenLastCalledWith(['a', 'b']);
  expect(activate).not.toHaveBeenCalled();
  expect(copy.defaultPrevented).toBe(false);

  pointer('a', 'pointerdown', 10, 10);
  pointer('a', 'pointermove', 11, 10);
  pointer('a', 'pointerup', 11, 10);
  act(() => phrase('a').click());
  expect(selection).toHaveBeenLastCalledWith(['a']);
  expect(activate).toHaveBeenCalledExactlyOnceWith('a');
  pointer('c', 'pointerdown', 70, 10);
  pointer('c', 'pointerup', 70, 10);
  act(() => phrase('c').dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true })));
  expect(selection).toHaveBeenLastCalledWith(['a', 'c']);
  expect(activate).toHaveBeenCalledTimes(1);
  expect(document.getSelection()!.getRangeAt(0)).toBe(range);
  expect(document.getSelection()!.toString()).toBe(copied);
});

it('starts a bounded range at the current phrase when filtering removed its previous anchor', () => {
  const props = {
    label: 'Document',
    phrases: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ],
    selectedIds: [],
    onSelection: selection,
    onActivate: activate,
  };
  act(() => root.render(<TextDocument {...props} />));
  act(() => phrase('a').click());
  activate.mockClear();
  act(() =>
    root.render(
      <TextDocument
        {...props}
        phrases={[
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
        ]}
      />
    )
  );
  act(() => phrase('b').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true })));
  expect(selection).toHaveBeenLastCalledWith(['b']);
  act(() => phrase('c').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true })));
  expect(selection).toHaveBeenLastCalledWith(['b', 'c']);
  expect(activate).not.toHaveBeenCalled();
});

it('keeps prose selectable under the actual extension and modal descendant styles', () => {
  const styles = document.createElement('style');
  styles.textContent = [
    readFileSync('packages/ui/src/styles/foundation.css', 'utf8'),
    readFileSync('packages/ui/src/styles/overlays/modal-shell.css', 'utf8'),
  ].join('\n');
  host.classList.add('sniptale-extension-surface', 'sniptale-modal');
  document.head.append(styles);
  try {
    mount();
    for (const node of [
      phrase('a'),
      host.querySelector<HTMLElement>('[data-ui="text-document"]')!,
    ]) {
      const computed = getComputedStyle(node);
      expect(computed.userSelect).toBe('text');
      expect(computed.getPropertyValue('-webkit-user-select')).toBe('text');
    }
  } finally {
    styles.remove();
  }
});
