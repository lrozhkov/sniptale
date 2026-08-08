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

let container: HTMLDivElement;
let root: Root;

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

describe('SettingsCollection drag lifecycle', () => {
  it('announces rejected self and cross-group drops as cancelled', () => {
    const onMove = vi.fn();
    act(() =>
      root.render(
        <SettingsCollection ariaLabel="Rejected" items={items} onAction={vi.fn()} onMove={onMove} />
      )
    );
    const firstHandle = container.querySelector<HTMLElement>('[draggable="true"]');
    const firstRow = container.querySelector<HTMLElement>(
      '[data-settings-collection-item="first"]'
    );
    act(() => firstHandle?.dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() =>
      firstRow?.dispatchEvent(
        new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: 0 })
      )
    );
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
    const handles = container.querySelectorAll<HTMLElement>('[draggable="true"]');
    const secondRow = container.querySelector<HTMLElement>(
      '[data-settings-collection-item="second"]'
    );
    act(() => handles[0]?.dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() =>
      secondRow?.dispatchEvent(
        new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: 0 })
      )
    );
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
      container
        .querySelector<HTMLElement>('[draggable="true"]')
        ?.dispatchEvent(new Event('dragstart', { bubbles: true }))
    );
    render(items, false);
    expect(container.textContent).toContain('Перемещение отменено');
    expect(onMove).not.toHaveBeenCalled();

    render(items, true);
    act(() =>
      container
        .querySelector<HTMLElement>('[draggable="true"]')
        ?.dispatchEvent(new Event('dragstart', { bubbles: true }))
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
});
