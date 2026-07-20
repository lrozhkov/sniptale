// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DESIGN_SYSTEM_REGISTRY } from '../../catalog/registry';
import { DesignSystemOverviewSection } from './overview-section';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

describe('DesignSystemOverviewSection', () => {
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

  it('renders catalog coverage stats without obsolete hero copy', async () => {
    await act(async () => {
      root?.render(
        <DesignSystemOverviewSection
          filteredEntriesCount={3}
          filteredVariants={5}
          filteredUsageContexts={8}
          totalVariants={13}
          totalUsageContexts={21}
        />
      );
    });

    expect(container?.querySelector('#overview')).not.toBeNull();
    expect(container?.textContent).toContain('designSystem.page.catalogStatsTitle');
    expect(container?.textContent).not.toContain('designSystem.page.badge');
    expect(container?.textContent).not.toContain('designSystem.page.title');
    expect(container?.textContent).not.toContain('designSystem.page.description');
    expect(container?.textContent).toContain(`3/${DESIGN_SYSTEM_REGISTRY.length}`);
    expect(container?.textContent).toContain('5/13');
    expect(container?.textContent).toContain('8/21');
  });
});
