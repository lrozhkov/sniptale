// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { BackgroundThumbnails } from './index';
it.each([undefined, 4])(
  'paginates ordered choices from initial count %s, removing More after exhaustion',
  async (initialCount) => {
    const firstCount = initialCount ?? 9;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const select = vi.fn();
    const items = Array.from({ length: 45 }, (_, n) => ({
      id: String(n),
      name: `Item ${n}`,
      groupLabel: n === 10 ? 'Next group' : undefined,
    }));
    try {
      await act(async () =>
        root.render(
          <BackgroundThumbnails
            items={items}
            label="Choices"
            onSelect={select}
            initialCount={initialCount}
          />
        )
      );
      expect(host.querySelectorAll('button[aria-pressed]')).toHaveLength(firstCount);
      expect(host.querySelectorAll('button')).toHaveLength(firstCount + 1);
      expect(host.querySelector('[data-ui="shared.ui.backgroundThumbnails.group"]')).toBeNull();
      await act(async () => host.querySelectorAll('button')[firstCount]!.click());
      expect(host.querySelectorAll('button[aria-pressed]')).toHaveLength(firstCount + 30);
      expect(
        host.querySelector('[data-ui="shared.ui.backgroundThumbnails.group"]')?.textContent
      ).toBe('Next group');
      await act(async () => host.querySelectorAll('button')[firstCount + 30]!.click());
      expect(host.querySelectorAll('button')).toHaveLength(45);
      expect([...host.querySelectorAll('button')].map((b) => b.title)).toEqual(
        items.map((i) => i.name)
      );
      await act(async () => host.querySelectorAll('button')[40]!.click());
      expect(select).toHaveBeenCalledWith('40');
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);
