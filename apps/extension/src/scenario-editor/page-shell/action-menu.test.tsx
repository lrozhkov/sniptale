// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuideActionMenu } from './action-menu';
let root: Root;
let container: HTMLDivElement;
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
  vi.restoreAllMocks();
});
it('supports keyboard navigation, escape restoration and outside dismissal without selecting', async () => {
  const select = vi.fn();
  await act(async () =>
    root.render(
      <GuideActionMenu
        label="Project"
        icon="…"
        items={[
          { label: 'Copy', icon: null, onSelect: select },
          { label: 'Delete', icon: null, onSelect: select, danger: true },
        ]}
      />
    )
  );
  const trigger = container.querySelector('button')!;
  await act(async () =>
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  expect(document.activeElement?.textContent).toBe('Copy');
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    )
  );
  expect(document.activeElement?.textContent).toBe('Delete');
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  );
  expect(document.activeElement).toBe(trigger);
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  await act(async () => trigger.click());
  await act(async () =>
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  );
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  expect(select).not.toHaveBeenCalled();
});

it('dismisses when keyboard focus moves to another context without stealing that focus', async () => {
  await act(async () =>
    root.render(
      <>
        <GuideActionMenu
          label="Project"
          icon="…"
          items={[{ label: 'Copy', icon: null, onSelect: vi.fn() }]}
        />
        <button data-outside>Outside</button>
      </>
    )
  );
  const trigger = container.querySelector('button')!;
  await act(async () => trigger.click());
  expect(document.querySelector('.guide-action-menu')).not.toBeNull();
  const outside = container.querySelector<HTMLButtonElement>('[data-outside]')!;
  await act(async () => outside.focus());
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  expect(document.activeElement).toBe(outside);
});

it('opens on hover without moving editing focus and closes after leaving the portaled menu', async () => {
  vi.useFakeTimers();
  const editor = document.createElement('input');
  document.body.append(editor);
  await act(async () =>
    root.render(
      <GuideActionMenu
        label="Insert"
        icon="+"
        openOnHover
        items={[{ label: 'Step', icon: null, onSelect: vi.fn() }]}
      />
    )
  );
  editor.focus();
  const trigger = container.querySelector('button')!;
  await act(async () => trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  expect(document.querySelector('.guide-action-menu')).not.toBeNull();
  expect(document.activeElement).toBe(editor);
  await act(async () => trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
  const menu = document.querySelector('.guide-action-menu')!;
  await act(async () => menu.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  act(() => vi.advanceTimersByTime(200));
  expect(document.querySelector('.guide-action-menu')).not.toBeNull();
  await act(async () => trigger.click());
  expect(document.activeElement?.textContent).toBe('Step');
  await act(async () => menu.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
  act(() => vi.advanceTimersByTime(200));
  expect(document.querySelector('.guide-action-menu')).not.toBeNull();
  await act(async () => editor.focus());
  await act(async () => menu.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
  act(() => vi.advanceTimersByTime(200));
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  editor.remove();
  vi.useRealTimers();
});
