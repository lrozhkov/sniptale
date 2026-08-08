// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsCollection } from '.';
import type { SettingsCollectionItem } from './types';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const items: readonly SettingsCollectionItem[] = [
  {
    id: 'first',
    title: 'First item',
    meta: 'Metadata',
    enabled: true,
    isDefault: true,
    capabilities: {
      edit: true,
      toggle: true,
      setDefault: true,
      reset: true,
      delete: true,
      reorder: true,
    },
  },
  { id: 'second', title: 'Second item', capabilities: { reorder: true } },
];

function getMenuTrigger(itemId: string): HTMLButtonElement | null {
  return container.querySelector(
    `[data-settings-collection-item="${itemId}"] [aria-haspopup="menu"]`
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

describe('SettingsCollection', () => {
  it('renders the fixed row action contract and translates intents without owning state', () => {
    const onAction = vi.fn();
    const onMove = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection ariaLabel="Presets" items={items} onAction={onAction} onMove={onMove} />
      )
    );

    expect(container.querySelector('section')?.getAttribute('aria-label')).toBe('Presets');
    expect(container.textContent).toContain('First item');
    expect(container.textContent).toContain('Metadata');
    expect(container.textContent).toContain('По умолчанию');
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Редактировать"]')?.click());
    expect(onAction).toHaveBeenCalledWith({ type: 'edit', itemId: 'first' });
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Выключить"]')?.click());
    expect(onAction).toHaveBeenCalledWith({ type: 'toggle', itemId: 'first', nextChecked: false });
  });

  it('supports loading, empty, and error states', () => {
    const renderState = (state: 'loading' | 'error' | 'ready', stateItems = items) =>
      act(() =>
        root.render(
          <SettingsCollection
            ariaLabel="States"
            items={stateItems}
            state={state}
            emptyState="Nothing here"
            errorState="Could not load"
            onAction={vi.fn()}
          />
        )
      );
    renderState('loading');
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    renderState('error');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Could not load');
    renderState('ready', []);
    expect(container.textContent).toContain('Nothing here');
  });

  it('emits keyboard move intents only after the handle is picked up', () => {
    const onMove = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection ariaLabel="Keyboard" items={items} onAction={vi.fn()} onMove={onMove} />
      )
    );
    const handle = container.querySelector<HTMLButtonElement>('[aria-label="Изменить позицию"]');
    act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    act(() =>
      handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    );
    expect(onMove).not.toHaveBeenCalled();
    act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    expect(onMove).toHaveBeenCalledWith({
      itemId: 'first',
      groupId: null,
      beforeItemId: null,
      source: 'keyboard',
    });
    expect(container.textContent).toContain('Элемент перемещён');
  });

  it('exposes reorder controls only when the collection accepts move intents', () => {
    act(() =>
      root.render(<SettingsCollection ariaLabel="Static" items={items} onAction={vi.fn()} />)
    );
    expect(container.querySelector('[aria-label="Изменить позицию"]')).toBeNull();
    expect(container.textContent).not.toContain('Переместить вверх');
  });

  it('keeps disabled reasons and busy state in the presentation contract', () => {
    const onAction = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection
          ariaLabel="Disabled"
          items={[
            {
              ...items[0]!,
              busy: true,
              disabledActions: { toggle: 'Keep one enabled', delete: 'System item' },
            },
          ]}
          onAction={onAction}
          onMove={vi.fn()}
        />
      )
    );
    expect(container.querySelector<HTMLButtonElement>('[title="Keep one enabled"]')?.disabled).toBe(
      true
    );
    act(() => getMenuTrigger('first')?.click());
    expect(container.querySelector<HTMLButtonElement>('[title="System item"]')?.disabled).toBe(
      true
    );
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Изменить позицию"]')?.disabled
    ).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('keeps the overflow actions in their fixed order', () => {
    act(() =>
      root.render(
        <SettingsCollection ariaLabel="Order" items={items} onAction={vi.fn()} onMove={vi.fn()} />
      )
    );
    act(() => getMenuTrigger('first')?.click());
    const labels = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[data-settings-collection-item="first"] [role="menuitem"]'
      ),
    ].map((button) => button.textContent?.trim());
    expect(labels).toEqual([
      'Сделать по умолчанию',
      'Переместить вверх',
      'Переместить вниз',
      'Сбросить',
      'Удалить',
    ]);
  });

  it('translates drag placement to the same insertion contract', () => {
    const onMove = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection ariaLabel="Drag" items={items} onAction={vi.fn()} onMove={onMove} />
      )
    );
    const handles = container.querySelectorAll<HTMLElement>('[draggable="true"]');
    const target = container.querySelector<HTMLElement>('[data-settings-collection-item="second"]');
    if (target) {
      target.getBoundingClientRect = () =>
        ({ top: 0, height: 100 }) as ReturnType<HTMLElement['getBoundingClientRect']>;
    }
    act(() => handles[0]?.dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() =>
      target?.dispatchEvent(
        new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: 90 })
      )
    );
    expect(onMove).toHaveBeenCalledWith({
      itemId: 'first',
      groupId: null,
      beforeItemId: null,
      source: 'drag',
    });
    expect(container.textContent).toContain('Элемент перемещён');
  });

  it('announces a cancelled drag when the handle is released without a move', () => {
    act(() =>
      root.render(
        <SettingsCollection ariaLabel="Cancel" items={items} onAction={vi.fn()} onMove={vi.fn()} />
      )
    );
    const handle = container.querySelector<HTMLElement>('[draggable="true"]');
    act(() => handle?.dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() => handle?.dispatchEvent(new Event('dragend', { bubbles: true })));
    expect(container.textContent).toContain('Перемещение отменено');
  });
});
