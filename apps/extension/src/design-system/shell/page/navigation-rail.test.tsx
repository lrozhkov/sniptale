// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignSystemNavigationRail } from './navigation-rail';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

describe('DesignSystemNavigationRail', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  it('renders the overview, token, shared, and product anchors in the sticky rail', async () => {
    await act(async () => {
      root?.render(<DesignSystemNavigationRail />);
    });

    const hrefs = Array.from(container?.querySelectorAll('a') ?? []).map((link) =>
      link.getAttribute('href')
    );

    expect(hrefs).toEqual(['#overview', '#tokens', '#shared-catalog', '#product-catalog']);
  });
});
