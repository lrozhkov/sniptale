import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { buildCompactInspectorControlsSharedPreviews } from './design-system';

type PreviewCallback = () => unknown;

function collectCallbacks(
  value: unknown,
  callbacks: PreviewCallback[],
  visited = new Set<object>()
): void {
  if (typeof value === 'function') {
    callbacks.push(value as PreviewCallback);
    return;
  }
  if (value === null || typeof value !== 'object' || visited.has(value)) {
    return;
  }
  visited.add(value);
  if (isValidElement<Record<string, unknown>>(value)) {
    collectCallbacks(value.props, callbacks, visited);
    return;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectCallbacks(child, callbacks, visited);
  }
}

it('renders every compact inspector preview and keeps its example callbacks callable', () => {
  const previews = buildCompactInspectorControlsSharedPreviews('en');
  const callbacks: PreviewCallback[] = [];

  for (const preview of previews) {
    expect(isValidElement(preview.preview)).toBe(true);
    expect(renderToStaticMarkup(preview.preview as ReactElement)).not.toBe('');
    collectCallbacks(preview.preview, callbacks);
  }

  expect(callbacks.length).toBeGreaterThanOrEqual(15);
  for (const callback of callbacks) {
    expect(() => callback()).not.toThrow();
  }
});
