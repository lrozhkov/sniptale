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
