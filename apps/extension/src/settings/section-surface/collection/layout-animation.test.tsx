// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SettingsCollection } from '.';
import type { SettingsCollectionItem } from './types';

const first: SettingsCollectionItem = { id: 'first', title: 'First', capabilities: {} };
const second: SettingsCollectionItem = { id: 'second', title: 'Second', capabilities: {} };
const originalBounds = HTMLElement.prototype.getBoundingClientRect;
const originalAnimate = HTMLElement.prototype.animate;
let phase = 0;

function dispatchPointer(target: Element | Window, type: 'pointerdown' | 'pointermove') {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientY: type === 'pointerdown' ? 10 : 20,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}

beforeEach(() => {
  phase = 0;
  HTMLElement.prototype.getBoundingClientRect = function getBounds() {
    const itemId = this.dataset['settingsCollectionItem'];
    const rootOffset = phase === 2 ? 120 : 0;
    const positions = phase === 1 ? { first: 52, second: 0 } : { first: 0, second: 52 };
    const top =
      itemId === 'first' || itemId === 'second' ? rootOffset + positions[itemId] : rootOffset;
    return { height: 52, left: 0, top } as DOMRect;
  };
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalBounds;
  HTMLElement.prototype.animate = originalAnimate;
});

it('animates rows into authoritative order and respects the shared motion contract', () => {
  const animate = vi.fn();
  HTMLElement.prototype.animate = animate;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <SettingsCollection ariaLabel="Animated" items={[first, second]} onAction={vi.fn()} />
    )
  );
  phase = 1;
  act(() =>
    root.render(
      <SettingsCollection ariaLabel="Animated" items={[second, first]} onAction={vi.fn()} />
    )
  );
  expect(animate).toHaveBeenCalledTimes(2);
  expect(animate).toHaveBeenCalledWith(expect.any(Array), {
    duration: 160,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
  });
  act(() => root.unmount());
});

it('ignores an ambient collection shift when the first authoritative update arrives', () => {
  const animate = vi.fn();
  HTMLElement.prototype.animate = animate;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <SettingsCollection ariaLabel="Stable offset" items={[first, second]} onAction={vi.fn()} />
    )
  );

  phase = 2;
  act(() =>
    root.render(
      <SettingsCollection
        ariaLabel="Stable offset"
        items={[{ ...first }, { ...second }]}
        onAction={vi.fn()}
      />
    )
  );

  expect(animate).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('does not replay accumulated layout drift when the first pointer drag begins', () => {
  const animate = vi.fn();
  HTMLElement.prototype.animate = animate;
  const container = document.createElement('div');
  const root = createRoot(container);
  const draggableItems = [first, second].map((item) => ({
    ...item,
    capabilities: { reorder: true },
  }));

  act(() =>
    root.render(
      <SettingsCollection
        ariaLabel="Stable drag start"
        items={draggableItems}
        onAction={vi.fn()}
        onMove={vi.fn()}
      />
    )
  );
  phase = 1;
  const handle = container.querySelector<HTMLElement>('[aria-label="Изменить позицию"]');
  act(() => dispatchPointer(handle!, 'pointerdown'));
  act(() => dispatchPointer(window, 'pointermove'));

  expect(animate).not.toHaveBeenCalled();
  act(() => root.unmount());
});
