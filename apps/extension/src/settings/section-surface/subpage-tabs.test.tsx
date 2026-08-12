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
  expect(container.querySelector('nav')?.className).toContain('sticky');
  expect(container.querySelector('nav')?.className).toContain('top-0');
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('Images');
  expect(container.querySelector('nav')?.className).not.toContain('border');
  expect(container.querySelector('nav')?.className).not.toContain('shadow');
  const activeButton = container.querySelector('[aria-current="page"]');
  const inactiveButton = container.querySelectorAll('button')[1];
  expect(activeButton?.className).toContain('min-h-11');
  expect(activeButton?.className).toContain('min-w-28');
  expect(activeButton?.className).not.toContain('rounded-');
  expect(activeButton?.className).not.toMatch(/(?:^|\s)bg-/u);
  expect(activeButton?.className).not.toContain('hover:bg-');
  expect(activeButton?.className).toContain('after:inset-x-0');
  expect(activeButton?.className).toContain('after:bg-[var(--sniptale-color-accent)]');
  expect(inactiveButton?.className).not.toContain('hover:bg-');
  expect(inactiveButton?.className).toContain('hover:text-[var(--sniptale-color-text-primary)]');
  act(() => container.querySelectorAll('button')[1]?.click());
  expect(onChange).toHaveBeenCalledWith('video');
  act(() => root.unmount());
});
