// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsCollection } from '.';
import { SettingsCollectionReorderHandle } from './row-controls';
import type { SettingsCollectionItem } from './types';

const items: readonly SettingsCollectionItem[] = [
  {
    id: 'first',
    title: 'First item',
    capabilities: { delete: true, reorder: true, reset: true, setDefault: true },
  },
  { id: 'second', title: 'Second item', capabilities: { reorder: true } },
];

let container: HTMLDivElement;
let root: Root;

function getMenuTrigger(itemId: string): HTMLButtonElement | null {
  return container.querySelector(
    `[data-settings-collection-item="${itemId}"] [aria-label="Действия"][aria-expanded]`
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('SettingsCollection interactions', () => {
  it('retains primary-pointer and keyboard admission on the reorder target', () => {
    const onPointerStart = vi.fn();
    const onKeyboardCancel = vi.fn();
    const onKeyboardMove = vi.fn();
    const onKeyboardToggle = vi.fn();
    const renderHandle = (active: boolean, busy = false) => {
      act(() =>
        root.render(
          <SettingsCollectionReorderHandle
            active={active}
            dragInstructionsId="instructions"
            item={{ ...items[0]!, busy }}
            onPointerStart={onPointerStart}
            onKeyboardCancel={onKeyboardCancel}
            onKeyboardMove={onKeyboardMove}
            onKeyboardToggle={onKeyboardToggle}
          />
        )
      );
      return container.querySelector<HTMLButtonElement>('button')!;
    };
    const pointer = (handle: HTMLButtonElement, button: number) => {
      const event = Object.assign(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          button,
          clientX: 10,
          clientY: 20,
        }),
        { pointerId: 5 }
      );
      act(() => {
        handle.dispatchEvent(event);
      });
      return event.defaultPrevented;
    };
    const key = (handle: HTMLButtonElement, key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      act(() => {
        handle.dispatchEvent(event);
      });
      return event.defaultPrevented;
    };
    const busy = renderHandle(false, true);
    expect(busy.hasAttribute('data-settings-reorder-handle')).toBe(true);
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect(pointer(busy, 0)).toBe(false);
    for (const command of ['Escape', ' ', 'Enter', 'ArrowUp', 'ArrowDown'])
      expect(key(busy, command)).toBe(true);
    expect(key(busy, 'Tab')).toBe(false);
    expect(onPointerStart).not.toHaveBeenCalled();
    expect(onKeyboardToggle).not.toHaveBeenCalled();
    expect(onKeyboardMove).not.toHaveBeenCalled();
    expect(onKeyboardCancel).not.toHaveBeenCalled();
    const handle = renderHandle(false);
    const capture = vi.fn();
    handle.setPointerCapture = capture;
    expect(pointer(handle, 2)).toBe(false);
    expect(pointer(handle, 0)).toBe(true);
    expect(capture).toHaveBeenCalledWith(5);
    expect(onPointerStart).toHaveBeenCalledWith('first', 5, 10, 20, null);
    expect(key(handle, 'Escape')).toBe(false);
    expect(key(handle, 'a')).toBe(false);
    expect(key(handle, ' ')).toBe(true);
    expect(key(handle, 'Enter')).toBe(true);
    expect(onKeyboardToggle).toHaveBeenCalledTimes(2);
    expect(key(handle, 'ArrowUp')).toBe(true);
    expect(key(handle, 'ArrowDown')).toBe(true);
    expect(onKeyboardMove.mock.calls).toEqual([
      ['first', -1],
      ['first', 1],
    ]);
    expect(key(renderHandle(true), 'Escape')).toBe(true);
    expect(onKeyboardCancel).toHaveBeenCalledOnce();
  });
  it('owns one inline action tray, outside dismissal, and focus restoration', () => {
    act(() =>
      root.render(
        <SettingsCollection ariaLabel="Menus" items={items} onAction={vi.fn()} onMove={vi.fn()} />
      )
    );
    const firstTrigger = getMenuTrigger('first');
    const secondTrigger = getMenuTrigger('second');
    act(() => firstTrigger?.click());
    expect(container.querySelectorAll('[role="toolbar"][aria-hidden="false"]')).toHaveLength(1);
    expect(document.activeElement?.getAttribute('data-collection-inline-action')).toBe(
      'set-default'
    );

    act(() => secondTrigger?.click());
    expect(container.querySelectorAll('[role="toolbar"][aria-hidden="false"]')).toHaveLength(1);
    expect(firstTrigger?.getAttribute('aria-expanded')).toBe('false');
    act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(container.querySelector('[role="toolbar"][aria-hidden="false"]')).toBeNull();
    expect(document.activeElement).toBe(secondTrigger);

    act(() => firstTrigger?.click());
    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(container.querySelector('[role="toolbar"][aria-hidden="false"]')).toBeNull();
    expect(document.activeElement).toBe(firstTrigger);
  });

  it('previews repeated keyboard moves and cancels them with Escape', () => {
    const onMove = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection
          ariaLabel="Cancel keyboard"
          items={items}
          onAction={vi.fn()}
          onMove={onMove}
        />
      )
    );
    const handle = container.querySelector<HTMLButtonElement>('[aria-label="Изменить позицию"]');
    act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    expect(handle?.getAttribute('aria-pressed')).toBe('true');
    act(() =>
      handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    );
    const firstAnnouncement = container.querySelector('[aria-live] span');
    expect(
      [...container.querySelectorAll('[data-settings-collection-item]')].map((row) =>
        row.getAttribute('data-settings-collection-item')
      )
    ).toEqual(['second', 'first']);
    act(() =>
      handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    );
    const secondAnnouncement = container.querySelector('[aria-live] span');
    expect(secondAnnouncement).not.toBe(firstAnnouncement);
    expect(secondAnnouncement?.textContent).toBe('Элемент перемещён');
    act(() =>
      handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    );
    act(() =>
      handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(handle?.getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).toContain('Перемещение отменено');
    expect(onMove).not.toHaveBeenCalled();
    expect(
      [...container.querySelectorAll('[data-settings-collection-item]')].map((row) =>
        row.getAttribute('data-settings-collection-item')
      )
    ).toEqual(['first', 'second']);
  });

  it('cancels a stale keyboard preview when authoritative items change', () => {
    const onMove = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection ariaLabel="Stale" items={items} onAction={vi.fn()} onMove={onMove} />
      )
    );
    const handle = container.querySelector<HTMLButtonElement>('[aria-label="Изменить позицию"]');
    act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    act(() =>
      handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    );
    act(() =>
      root.render(
        <SettingsCollection
          ariaLabel="Stale"
          items={[...items, { id: 'third', title: 'Third item', capabilities: { reorder: true } }]}
          onAction={vi.fn()}
          onMove={onMove}
        />
      )
    );
    expect(container.textContent).toContain('Перемещение отменено');
    expect(
      container
        .querySelector<HTMLButtonElement>('[aria-label="Изменить позицию"]')
        ?.getAttribute('aria-pressed')
    ).toBe('false');
    expect(onMove).not.toHaveBeenCalled();
  });
});
