// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsCollection } from '.';
import type { SettingsCollectionItem } from './types';

const items: readonly SettingsCollectionItem[] = [
  { id: 'first', title: 'First item', capabilities: { reorder: true } },
  { id: 'second', title: 'Second item', capabilities: { reorder: true } },
];
const originalBounds = HTMLElement.prototype.getBoundingClientRect;

let container: HTMLDivElement;
let root: Root;

function dispatchPointer(
  target: Element | null,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
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

function pointAt(target: Element | null) {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => target,
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  HTMLElement.prototype.getBoundingClientRect = function getBounds() {
    const row = this.closest<HTMLElement>('[data-settings-collection-item]');
    if (!row) return { height: 0, left: 0, top: 0 } as DOMRect;
    const rows = Array.from(
      row
        .closest('[data-settings-collection-root]')
        ?.querySelectorAll('[data-settings-collection-item]') ?? []
    );
    return { height: 52, left: 0, top: rows.indexOf(row) * 52 } as DOMRect;
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  HTMLElement.prototype.getBoundingClientRect = originalBounds;
  vi.unstubAllGlobals();
});

describe('SettingsCollection drag lifecycle', () => {
  it('uses horizontal pointer movement to reorder tiles in the same row', () => {
    const onMove = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection
          ariaLabel="Palette tiles"
          layout="tiles"
          items={items}
          onAction={vi.fn()}
          onMove={onMove}
        />
      )
    );
    for (const [index, row] of [
      ...container.querySelectorAll<HTMLElement>('[data-settings-collection-item]'),
    ].entries()) {
      row.getBoundingClientRect = () =>
        ({ top: 0, left: index * 200, width: 190, height: 44, bottom: 44 }) as DOMRect;
    }
    const handle = container.querySelector<HTMLElement>('[aria-label="Изменить позицию"]');
    act(() => dispatchPointer(handle, 'pointerdown', { clientX: 20, clientY: 20 }));
    act(() => dispatchPointer(document.body, 'pointermove', { clientX: 350, clientY: 20 }));
    expect(onMove).not.toHaveBeenCalled();
    act(() => dispatchPointer(document.body, 'pointerup', { clientX: 350, clientY: 20 }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith({
      itemId: 'first',
      beforeItemId: null,
      groupId: null,
      source: 'drag',
    });
  });

  it('announces rejected self and cross-group drops as cancelled', () => {
    const onMove = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection ariaLabel="Rejected" items={items} onAction={vi.fn()} onMove={onMove} />
      )
    );
    const firstHandle = container.querySelector<HTMLElement>('[aria-label="Изменить позицию"]');
    const firstRow = container.querySelector<HTMLElement>(
      '[data-settings-collection-item="first"]'
    );
    pointAt(firstRow);
    act(() => dispatchPointer(firstHandle, 'pointerdown'));
    act(() => dispatchPointer(firstHandle, 'pointermove', { clientY: 10 }));
    act(() => dispatchPointer(firstHandle, 'pointerup', { clientY: 10 }));
    expect(container.textContent).toContain('Перемещение отменено');
    expect(onMove).not.toHaveBeenCalled();

    act(() =>
      root.render(
        <SettingsCollection
          ariaLabel="Rejected"
          items={items}
          groups={[
            { id: 'one', itemIds: ['first'] },
            { id: 'two', itemIds: ['second'] },
          ]}
          onAction={vi.fn()}
          onMove={onMove}
        />
      )
    );
    const handles = container.querySelectorAll<HTMLElement>('[aria-label="Изменить позицию"]');
    const secondRow = container.querySelector<HTMLElement>(
      '[data-settings-collection-item="second"]'
    );
    pointAt(secondRow);
    act(() => dispatchPointer(handles[0] ?? null, 'pointerdown'));
    act(() => dispatchPointer(handles[0] ?? null, 'pointermove', { clientY: 10 }));
    act(() => dispatchPointer(handles[0] ?? null, 'pointerup', { clientY: 10 }));
    expect(container.textContent).toContain('Перемещение отменено');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('cancels an active drag when move availability or source capability changes', () => {
    const onMove = vi.fn();
    const render = (nextItems: readonly SettingsCollectionItem[], moveEnabled: boolean) =>
      act(() =>
        root.render(
          <SettingsCollection
            ariaLabel="Stale drag"
            items={nextItems}
            onAction={vi.fn()}
            {...(moveEnabled ? { onMove } : {})}
          />
        )
      );

    render(items, true);
    act(() =>
      dispatchPointer(
        container.querySelector<HTMLElement>('[aria-label="Изменить позицию"]'),
        'pointerdown'
      )
    );
    act(() =>
      dispatchPointer(
        container.querySelector<HTMLElement>('[aria-label="Изменить позицию"]'),
        'pointermove',
        { clientY: 10 }
      )
    );
    render(items, false);
    expect(container.textContent).toContain('Перемещение отменено');
    expect(onMove).not.toHaveBeenCalled();

    render(items, true);
    act(() =>
      dispatchPointer(
        container.querySelector<HTMLElement>('[aria-label="Изменить позицию"]'),
        'pointerdown',
        { pointerId: 2 }
      )
    );
    act(() =>
      dispatchPointer(
        container.querySelector<HTMLElement>('[aria-label="Изменить позицию"]'),
        'pointermove',
        { clientY: 10, pointerId: 2 }
      )
    );
    render(
      items.map((item) =>
        item.id === 'first' ? { ...item, capabilities: { reorder: false } } : item
      ),
      true
    );
    expect(container.textContent).toContain('Перемещение отменено');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('opens a live slot without overlapping rows and commits once on release', () => {
    const onMove = vi.fn();
    const threeItems: readonly SettingsCollectionItem[] = [
      ...items,
      { id: 'third', title: 'Third item', capabilities: { reorder: true } },
    ];
    act(() =>
      root.render(
        <SettingsCollection
          ariaLabel="Continuous drag"
          items={threeItems}
          onAction={vi.fn()}
          onMove={onMove}
        />
      )
    );
    const firstHandle = container.querySelector<HTMLElement>(
      '[data-settings-collection-item="first"] [aria-label="Изменить позицию"]'
    );

    act(() => dispatchPointer(firstHandle, 'pointerdown', { clientY: 10 }));
    act(() => dispatchPointer(window.document.body, 'pointermove', { clientY: 80 }));
    expect(
      [...container.querySelectorAll('[data-settings-collection-item]')].map((row) =>
        row.getAttribute('data-settings-collection-item')
      )
    ).toEqual(['second', 'first', 'third']);
    const firstRow = container.querySelector<HTMLElement>(
      '[data-settings-collection-item="first"]'
    );
    const secondRow = container.querySelector<HTMLElement>(
      '[data-settings-collection-item="second"]'
    );
    expect(firstRow?.style.transform).toBe('');
    expect(onMove).not.toHaveBeenCalled();
    expect(secondRow?.className).not.toContain('hover:bg-');
    expect(
      container
        .querySelector('[data-settings-collection-root]')
        ?.getAttribute('data-settings-collection-pointer-dragging')
    ).toBe('true');

    act(() => dispatchPointer(window.document.body, 'pointermove', { clientY: 140 }));
    expect(
      [...container.querySelectorAll('[data-settings-collection-item]')].map((row) =>
        row.getAttribute('data-settings-collection-item')
      )
    ).toEqual(['second', 'third', 'first']);
    expect(firstRow?.style.transform).toBe('');
    expect(onMove).not.toHaveBeenCalled();
    act(() => dispatchPointer(window.document.body, 'pointerup', { clientY: 140 }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith({
      beforeItemId: null,
      groupId: null,
      itemId: 'first',
      source: 'drag',
    });
    expect(firstRow?.style.transform).toBe('');
  });
  it.each(['Escape', 'blur'])(
    'restores the original slots on %s without a persistence command',
    (reason) => {
      const onMove = vi.fn();
      act(() =>
        root.render(
          <SettingsCollection
            ariaLabel="Cancel preview"
            items={items}
            onAction={vi.fn()}
            onMove={onMove}
          />
        )
      );
      const handle = container.querySelector<HTMLElement>('[aria-label="Изменить позицию"]');
      act(() => dispatchPointer(handle, 'pointerdown', { clientY: 10 }));
      act(() => dispatchPointer(document.body, 'pointermove', { clientY: 90 }));
      expect(
        container
          .querySelector('[data-settings-collection-item]')
          ?.getAttribute('data-settings-collection-item')
      ).toBe('second');
      act(() =>
        window.dispatchEvent(
          reason === 'Escape' ? new KeyboardEvent('keydown', { key: 'Escape' }) : new Event('blur')
        )
      );
      act(() => dispatchPointer(document.body, 'pointerup', { clientY: 90 }));
      expect(
        container
          .querySelector('[data-settings-collection-item]')
          ?.getAttribute('data-settings-collection-item')
      ).toBe('first');
      expect(onMove).not.toHaveBeenCalled();
    }
  );
});
