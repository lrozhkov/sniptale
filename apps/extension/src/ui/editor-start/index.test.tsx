// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorStart, sortEditorStartItems, type EditorStartItem } from './index';

const labels = {
  title: 'Editor',
  description: 'Choose a project',
  createLabel: 'Create',
  openLabel: 'Open',
  recentLabel: 'Recent',
  emptyLabel: 'Nothing here',
  loadingLabel: 'Loading',
  errorLabel: 'Unavailable',
  retryLabel: 'Retry',
  searchLabel: 'Search projects',
  unavailableLabel: 'Unsupported',
  icon: <span>icon</span>,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(items: EditorStartItem[], status: 'loading' | 'ready' | 'error' = 'ready') {
  const onSelect = vi.fn();
  const onCreate = vi.fn();
  const onOpen = vi.fn();
  const onRetry = vi.fn();
  act(() =>
    root.render(
      <EditorStart
        {...labels}
        items={items}
        status={status}
        browseOnOpen
        onSelect={onSelect}
        onCreate={onCreate}
        onOpen={onOpen}
        onRetry={onRetry}
      />
    )
  );
  return { onSelect, onCreate, onOpen, onRetry };
}

it('shows six recent cards, then searches all compatible projects with native buttons', () => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    title: `Project ${index}`,
    detail: 'Saved',
  }));
  const actions = render(items);
  expect(container.querySelectorAll('section button')).toHaveLength(6);
  act(() => container.querySelector<HTMLButtonElement>('button:nth-of-type(2)')?.click());
  const input = container.querySelector<HTMLInputElement>('input[placeholder="Search projects"]');
  expect(input).not.toBeNull();
  act(() => {
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Project 7');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(container.querySelectorAll('section button')).toHaveLength(1);
  act(() => container.querySelector<HTMLButtonElement>('section button')?.click());
  expect(actions.onSelect).toHaveBeenCalledWith('7');
});

it('keeps Create and Open available when the recent list fails', () => {
  const actions = render([], 'error');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Unavailable');
  act(() => container.querySelector<HTMLButtonElement>('button')?.click());
  expect(actions.onCreate).toHaveBeenCalledOnce();
  act(() => container.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());
  expect(actions.onRetry).toHaveBeenCalledOnce();
});

it('sorts equal timestamps by stable id without mutating the source', () => {
  const source = [
    { id: 'b', title: 'B', detail: '', updatedAt: 5 },
    { id: 'a', title: 'A', detail: '', updatedAt: 5 },
    { id: 'c', title: 'C', detail: '', updatedAt: 7 },
  ];
  expect(sortEditorStartItems(source).map((item) => item.id)).toEqual(['c', 'a', 'b']);
  expect(source[0]?.id).toBe('b');
});
