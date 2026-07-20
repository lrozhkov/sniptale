// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PagesSummaryRow } from './summary-row';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderRow(props: React.ComponentProps<typeof PagesSummaryRow>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PagesSummaryRow {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function verifyUsesTabFavicon() {
  await renderRow({
    favIconUrl: 'https://example.test/favicon-32.png',
    onRemove: vi.fn(),
    title: 'Example Domain',
    url: 'https://example.test/page',
  });

  expect(container?.querySelector('img')?.getAttribute('src')).toBe(
    'https://example.test/favicon-32.png'
  );
}

async function verifyRemoveButton() {
  const onRemove = vi.fn();

  await renderRow({
    favIconUrl: null,
    onRemove,
    title: 'Example Domain',
    url: 'https://example.test/page',
  });

  await act(async () => {
    container?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(onRemove).toHaveBeenCalledTimes(1);
}

async function verifyFaviconClassName() {
  await renderRow({
    favIconUrl: 'https://example.test/favicon-32.png',
    onRemove: vi.fn(),
    title: 'Example Domain',
    url: 'https://example.test/page',
  });

  expect(container?.querySelector('img')?.className).not.toContain('rounded');
}

async function verifyFaviconFallbackSequence() {
  await renderRow({
    favIconUrl: 'https://cdn.example.test/favicon-32.png',
    onRemove: vi.fn(),
    title: 'Example Domain',
    url: 'https://example.test/page',
  });

  const image = container?.querySelector('img');
  expect(image?.getAttribute('src')).toBe('https://cdn.example.test/favicon-32.png');

  await act(async () => {
    image?.dispatchEvent(new Event('error'));
  });
  expect(container?.querySelector('img')?.getAttribute('src')).toBe(
    'https://example.test/favicon.ico'
  );

  await act(async () => {
    container?.querySelector('img')?.dispatchEvent(new Event('error'));
  });
  expect(container?.querySelector('img')).toBeNull();
  expect(container?.querySelector('svg')).not.toBeNull();
}

describe('PagesSummaryRow', () => {
  it('uses the tab favicon when one is available', verifyUsesTabFavicon);
  it('removes the selected page through the inline delete button', verifyRemoveButton);
  it('renders favicons without extra corner rounding', verifyFaviconClassName);
  it(
    'falls back from the tab favicon to the origin favicon and then to the default globe icon',
    verifyFaviconFallbackSequence
  );
});
