// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PreviewNavigationZone } from './navigation-zones';
import type { PreviewPanelProps } from './types';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const host = document.createElement('div');
document.body.appendChild(host);
const root = createRoot(host);

function renderZones(navigation: NonNullable<PreviewPanelProps['navigation']> | null) {
  act(() => {
    root.render(
      navigation ? (
        <>
          <PreviewNavigationZone direction="previous" navigation={navigation} />
          <PreviewNavigationZone direction="next" navigation={navigation} />
        </>
      ) : null
    );
  });
}

afterEach(() => {
  renderZones(null);
});

it('uses the existing navigation callbacks and native disabled boundaries', () => {
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  renderZones({ current: 1, total: 3, hasPrevious: false, hasNext: true, onPrevious, onNext });

  const previous = host.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.preview.navigationZone.previous"]'
  );
  const next = host.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.preview.navigationZone.next"]'
  );
  expect(previous?.disabled).toBe(true);
  expect(next?.disabled).toBe(false);
  expect(previous?.getAttribute('aria-label')).toBe('gallery.preview.previous');
  expect(next?.getAttribute('aria-label')).toBe('gallery.preview.next');
  expect(next?.className).toContain('focus-visible:ring-2');

  act(() => {
    previous?.click();
    next?.click();
  });
  expect(onPrevious).not.toHaveBeenCalled();
  expect(onNext).toHaveBeenCalledOnce();
});

it('replaces callbacks and boundary state with the current filtered list', () => {
  const oldNext = vi.fn();
  const newPrevious = vi.fn();
  renderZones({
    current: 1,
    total: 2,
    hasPrevious: false,
    hasNext: true,
    onPrevious: vi.fn(),
    onNext: oldNext,
  });
  const next = host.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.preview.navigationZone.next"]'
  );

  renderZones({
    current: 2,
    total: 2,
    hasPrevious: true,
    hasNext: false,
    onPrevious: newPrevious,
    onNext: vi.fn(),
  });
  expect(next?.disabled).toBe(true);
  act(() => {
    next?.click();
    host
      .querySelector<HTMLButtonElement>('[data-ui="gallery.preview.navigationZone.previous"]')
      ?.click();
  });
  expect(oldNext).not.toHaveBeenCalled();
  expect(newPrevious).toHaveBeenCalledOnce();

  renderZones(null);
  expect(host.querySelector('[data-ui^="gallery.preview.navigationZone"]')).toBeNull();
});
