// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuideInsertActions } from './insert-actions';
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(100, 100, 32, 32)
  );
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
it('keeps insertion actions in a horizontal icon row with focusable tooltips', async () => {
  await act(async () =>
    root.render(
      <GuideInsertActions
        label="Insert"
        disabled={false}
        items={[
          { label: 'Step', icon: <span>1</span>, onSelect: vi.fn() },
          { label: 'Section', icon: <span>2</span>, onSelect: vi.fn() },
        ]}
      />
    )
  );
  const trigger = container.querySelector<HTMLButtonElement>('button')!;
  await act(async () => trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  const menu = document.querySelector<HTMLElement>('.guide-action-menu')!;
  expect(menu.classList.contains('guide-action-menu--insert')).toBe(true);
  expect(menu.style.width).toBe('136px');
  expect(trigger.getAttribute('aria-hidden')).toBe('true');
  expect(trigger.tabIndex).toBe(-1);
  expect(menu.querySelector('[role="group"]')?.classList.contains('guide-insert-actions')).toBe(
    true
  );
  const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Step', 'Section']);
  expect(buttons[0]?.querySelector('[role="tooltip"]')?.textContent).toBe('Step');
  await act(async () =>
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  expect(document.activeElement).toBe(buttons[0]);
  await act(async () =>
    buttons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(document.activeElement).toBe(buttons[1]);
  await act(async () =>
    buttons[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(document.activeElement).toBe(trigger);
});

it('keeps the insertion row inside the viewport and updates on scroll', async () => {
  const rect = vi.fn(() => ({
    left: 1000,
    right: 1032,
    top: 720,
    bottom: 752,
    width: 32,
    height: 32,
  }));
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = rect as unknown as typeof original;
  try {
    await act(async () =>
      root.render(
        <GuideInsertActions
          label="Insert"
          disabled={false}
          items={[0, 1, 2, 3, 4].map((index) => ({
            label: `Action ${index}`,
            icon: null,
            onSelect: vi.fn(),
          }))}
        />
      )
    );
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    const menu = document.querySelector<HTMLElement>('.guide-action-menu')!;
    expect(menu.style.width).toBe('208px');
    expect(Number.parseFloat(menu.style.left)).toBeLessThanOrEqual(window.innerWidth - 216);
    expect(Number.parseFloat(menu.style.top)).toBe(720);
    rect.mockReturnValue({
      left: 16,
      right: 48,
      top: 100,
      bottom: 132,
      width: 32,
      height: 32,
    });
    await act(async () => container.dispatchEvent(new Event('scroll')));
    expect(Number.parseFloat(menu.style.left)).toBe(8);
    expect(Number.parseFloat(menu.style.top)).toBe(100);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = original;
  }
});

it('skips disabled insertion actions when the keyboard opens the row', async () => {
  const unavailable = vi.fn();
  const add = vi.fn();
  await act(async () =>
    root.render(
      <GuideInsertActions
        label="Insert"
        disabled={false}
        items={[
          { label: 'Unavailable', icon: null, onSelect: unavailable, disabled: true },
          { label: 'Step', icon: null, onSelect: add },
        ]}
      />
    )
  );
  const trigger = container.querySelector<HTMLButtonElement>('button')!;
  await act(async () =>
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Step');
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(add).toHaveBeenCalledOnce();
  expect(unavailable).not.toHaveBeenCalled();
});
