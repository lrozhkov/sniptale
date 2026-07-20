// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { requestViewerSelectionArea } from './selection';

afterEach(() => {
  document.body.replaceChildren();
});

function createIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  iframe.getBoundingClientRect = () =>
    ({
      bottom: 100,
      height: 80,
      left: 10,
      right: 110,
      top: 20,
      width: 100,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }) as DOMRect;
  return iframe;
}

function dispatchPointer(target: Element, type: string, clientX: number, clientY: number): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    })
  );
}

it('limits selection to the snapshot iframe surface and returns iframe-local coordinates', async () => {
  const selectionPromise = requestViewerSelectionArea(createIframe());
  const overlay = document.querySelector('[data-sniptale-viewer-selection-overlay="true"]');

  if (!overlay) {
    throw new Error('Expected viewer selection overlay.');
  }

  dispatchPointer(overlay, 'pointerdown', 20, 30);
  dispatchPointer(overlay, 'pointermove', 200, 200);
  dispatchPointer(overlay, 'pointerup', 200, 200);

  await expect(selectionPromise).resolves.toEqual({
    height: 70,
    width: 90,
    x: 10,
    y: 10,
  });
  expect(document.querySelector('[data-sniptale-viewer-selection-overlay="true"]')).toBeNull();
});

it('cancels selection on Escape and removes the disposable overlay', async () => {
  const selectionPromise = requestViewerSelectionArea(createIframe());

  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

  await expect(selectionPromise).rejects.toThrow('selection capture was cancelled');
  expect(document.querySelector('[data-sniptale-viewer-selection-overlay="true"]')).toBeNull();
});
