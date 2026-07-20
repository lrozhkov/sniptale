import type React from 'react';

function moveTileFocus(container: HTMLElement, target: EventTarget | null, step: number): void {
  if (!(target instanceof HTMLElement) || !target.matches('[data-shape-browser-tile="true"]')) {
    return;
  }

  const tiles = Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      'button[data-shape-browser-tile="true"]:not(:disabled)'
    )
  );
  const currentIndex = tiles.indexOf(target as HTMLButtonElement);
  const next = tiles[currentIndex + step];
  next?.focus();
}

function focusTileAt(container: HTMLElement, index: number): void {
  const tiles = container.querySelectorAll<HTMLButtonElement>(
    'button[data-shape-browser-tile="true"]:not(:disabled)'
  );
  const targetIndex = index < 0 ? tiles.length + index : index;
  tiles[targetIndex]?.focus();
}

export function handleBrowserKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
  const container = event.currentTarget;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    moveTileFocus(container, event.target, 1);
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveTileFocus(container, event.target, -1);
  } else if (event.key === 'Home') {
    event.preventDefault();
    focusTileAt(container, 0);
  } else if (event.key === 'End') {
    event.preventDefault();
    focusTileAt(container, -1);
  }
}
