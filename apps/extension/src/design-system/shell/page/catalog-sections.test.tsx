// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignSystemTokenGroupsSection } from './catalog-sections';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

describe('DesignSystemTokenGroupsSection', () => {
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

  it('renders token group metadata and token items inside the explorer section', async () => {
    await act(async () => {
      root?.render(<DesignSystemTokenGroupsSection />);
    });

    expect(container?.querySelector('section#tokens')).not.toBeNull();
    expect(container?.textContent).toContain('designSystem.page.tokenGroupsTitle');
    expect(container?.textContent).toContain('designSystem.page.tokenGroupsDescription');
    expect(container?.querySelectorAll('article').length).toBeGreaterThan(0);
  });
});
