// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsCollection } from '.';
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
