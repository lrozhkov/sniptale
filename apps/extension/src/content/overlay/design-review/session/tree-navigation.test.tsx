// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDesignReviewTreeNavigation } from './tree-navigation';

const history = vi.hoisted(() => ({ clear: null as (() => void) | null }));
vi.mock('../../../parser/page-preparation/history', () => ({
  pagePreparationHistory: {
    subscribeToClear: (clear: () => void) => {
      history.clear = clear;
      return () => {
        history.clear = null;
      };
    },
  },
}));

let root: Root;
let host: HTMLDivElement;
let read: ReturnType<typeof useDesignReviewTreeNavigation>;
function Harness({ target }: { target: Element | null }) {
  read = useDesignReviewTreeNavigation(target);
  return null;
}
function select(target: Element | null) {
  act(() => root.render(<Harness target={target} />));
}
function box(parent: Element = document.body) {
  const element = document.createElement('div');
  parent.append(element);
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () =>
      element.style.display === 'none' || element.style.display === 'contents'
        ? []
        : [new DOMRect(0, 0, 100, 50)],
  });
  return element;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('blocks an unknown multi-child branch but permits its parent and unique child', () => {
  const parent = box();
  const first = box(parent);
  box(parent);
  select(parent);
  expect(read().child).toBeNull();
  select(first);
  expect(read().parent).toBe(parent);
  expect(read().child).toBeNull();
  const child = box(first);
  expect(read().child).toBe(child);
});

it('returns to the manually selected branch rather than the first child', () => {
  const parent = box();
  box(parent);
  const second = box(parent);
  const third = box(parent);
  select(second);
  select(parent);
  expect(read().child).toBe(second);
  select(third);
  select(parent);
  expect(read().child).toBe(third);
  history.clear?.();
  expect(read().child).toBeNull();
});

it.each(['removed', 'hidden', 'reparented'] as const)(
  'rejects a %s remembered branch without choosing another sibling',
  (mutation) => {
    const parent = box();
    box(parent);
    const selected = box(parent);
    box(parent);
    select(selected);
    select(parent);
    if (mutation === 'removed') selected.remove();
    if (mutation === 'hidden') selected.style.display = 'none';
    if (mutation === 'reparented') box().append(selected);
    expect(read().child).toBeNull();
  }
);

it('preserves the visited route across ancestors without an inspectable box', () => {
  const parent = box();
  const transparent = box(parent);
  transparent.style.display = 'contents';
  const child = box(transparent);
  select(child);
  expect(read().parent).toBe(parent);
  select(parent);
  expect(read().child).toBe(child);
  select(null);
  expect(read()).toEqual({ parent: null, child: null });
});
