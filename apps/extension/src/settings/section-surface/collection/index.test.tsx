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
    isBuiltIn: true,
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
    `[data-settings-collection-item="${itemId}"] [aria-label="Действия"][aria-expanded]`
  );
}

function dispatchPointer(
  target: Element | null,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  options: { clientX?: number; clientY?: number; pointerId?: number } = {}
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
  });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 });
  target?.dispatchEvent(event);
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
    expect(container.querySelector('[data-settings-collection-markers]')?.textContent).toContain(
      'Предустановленный'
    );
    expect(container.textContent).toContain('По умолчанию');
    for (const control of container.querySelectorAll<HTMLButtonElement>('button[aria-label]')) {
      expect(control.title).not.toBe('');
    }
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

  it('renders the canonical plus icon for add actions', () => {
    const onInvoke = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection
          ariaLabel="Add action"
          items={[]}
          addAction={{ label: 'Добавить', onInvoke }}
          onAction={vi.fn()}
        />
      )
    );

    const addButton = container.querySelector<HTMLButtonElement>('button');
    expect(addButton?.querySelector('.lucide-plus')).not.toBeNull();
    act(() => addButton?.click());
    expect(onInvoke).toHaveBeenCalledOnce();
  });

  it('shows a single secondary action directly without the three-dot trigger', () => {
    const onAction = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection
          ariaLabel="Profiles"
          items={[{ id: 'profile', title: 'Profile', capabilities: { setDefault: true } }]}
          onAction={onAction}
        />
      )
    );

    expect(container.querySelector('[aria-label="Действия"]')).toBeNull();
    const directAction = container.querySelector<HTMLButtonElement>(
      '[data-collection-direct-action="set-default"]'
    );
    expect(directAction?.title).toBe('Сделать по умолчанию');
    expect(directAction?.className).toContain('opacity-0');
    expect(directAction?.className).toContain('group-hover:opacity-100');
    expect(directAction?.className).toContain('group-focus-within:opacity-100');
    expect(directAction?.tabIndex).toBe(0);
    act(() => directAction?.click());
    expect(onAction).toHaveBeenCalledWith({ type: 'set-default', itemId: 'profile' });
  });

  it('keeps a sole non-default action persistently visible', () => {
    act(() =>
      root.render(
        <SettingsCollection
          ariaLabel="Profiles"
          items={[{ id: 'profile', title: 'Profile', capabilities: { delete: true } }]}
          onAction={vi.fn()}
        />
      )
    );

    const directAction = container.querySelector<HTMLButtonElement>(
      '[data-collection-direct-action="delete"]'
    );
    expect(directAction).not.toBeNull();
    expect(directAction?.className).not.toContain('opacity-0');
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
        '[data-settings-collection-item="first"] [data-collection-inline-action]'
      ),
    ].map((button) => button.getAttribute('aria-label'));
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
    const handles = container.querySelectorAll<HTMLElement>('[aria-label="Изменить позицию"]');
    const target = container.querySelector<HTMLElement>('[data-settings-collection-item="second"]');
    if (target) {
      target.getBoundingClientRect = () =>
        ({ top: 0, height: 100 }) as ReturnType<HTMLElement['getBoundingClientRect']>;
    }
    act(() => dispatchPointer(handles[0] ?? null, 'pointerdown'));
    act(() => dispatchPointer(handles[0] ?? null, 'pointermove', { clientY: 90 }));
    expect(
      [...container.querySelectorAll('[data-settings-collection-item]')].map((row) =>
        row.getAttribute('data-settings-collection-item')
      )
    ).toEqual(['first', 'second']);
    expect(
      container
        .querySelector('[data-settings-collection-dragging="true"]')
        ?.getAttribute('data-settings-collection-item')
    ).toBe('first');
    expect(
      container
        .querySelector('[data-settings-collection-item="second"]')
        ?.getAttribute('data-settings-collection-drop-after')
    ).toBe('true');
    expect(container.querySelector('[draggable]')).toBeNull();
    act(() => dispatchPointer(handles[0] ?? null, 'pointerup', { clientY: 90 }));
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
    const handle = container.querySelector<HTMLElement>('[aria-label="Изменить позицию"]');
    act(() => dispatchPointer(handle, 'pointerdown'));
    act(() => dispatchPointer(handle, 'pointermove', { clientY: 10 }));
    act(() => dispatchPointer(handle, 'pointercancel', { clientY: 10 }));
    expect(container.textContent).toContain('Перемещение отменено');
  });
});
