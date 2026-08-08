// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SettingsSubpageTabs } from './subpage-tabs';

it('uses ordinary route-navigation semantics and reports the selected destination', () => {
  const onChange = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <SettingsSubpageTabs
        activeId="image"
        ariaLabel="Media"
        items={[
          { id: 'image', label: 'Images' },
          { id: 'video', label: 'Video' },
        ]}
        onChange={onChange}
      />
    )
  );
  expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Media');
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('Images');
  act(() => container.querySelectorAll('button')[1]?.click());
  expect(onChange).toHaveBeenCalledWith('video');
  act(() => root.unmount());
});
