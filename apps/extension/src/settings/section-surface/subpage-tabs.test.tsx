// @vitest-environment jsdom

import { CommandPressScope } from '@sniptale/ui/control-language/press';

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
      <CommandPressScope value={true}>
        <SettingsSubpageTabs
          activeId="image"
          ariaLabel="Media"
          items={[
            { id: 'image', label: 'Images' },
            { id: 'video', label: 'Video' },
          ]}
          onChange={onChange}
        />
      </CommandPressScope>
    )
  );
  expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Media');
  expect(container.querySelector('nav')?.className).toContain('sticky');
  expect(container.querySelector('nav')?.className).toContain('settings-scroll-inset-top');
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('Images');
  expect(container.querySelector('nav')?.className).toContain('border-b');
  expect(container.querySelector('nav')?.className).not.toContain('shadow');
  expect(container.querySelector('nav')?.style.backgroundColor).toBe(
    'var(--sniptale-color-surface-canvas)'
  );
  const activeButton = container.querySelector('[aria-current="page"]');
  const inactiveButton = container.querySelectorAll('button')[1];
  expect(activeButton?.getAttribute('title')).toBe('Images');
  expect(activeButton?.hasAttribute('data-command-press')).toBe(true);
  expect(activeButton?.getAttribute('data-command-property')).toBeNull();
  expect(activeButton?.getAttribute('aria-pressed')).toBeNull();
  expect(inactiveButton?.getAttribute('title')).toBe('Video');
  expect(container.querySelector('[role=tab]')).toBeNull();
  expect(container.querySelector('nav')?.className).toContain('overflow-x-auto');
  act(() => container.querySelectorAll('button')[1]?.click());
  expect(onChange).toHaveBeenCalledWith('video');
  act(() => root.unmount());
});

it('keeps nested subpage navigation inline without competing for the sticky edge', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <SettingsSubpageTabs
        activeId="required"
        ariaLabel="Permissions"
        items={[{ id: 'required', label: 'Required' }]}
        placement="inline"
      />
    )
  );
  expect(container.querySelector('nav')?.className).not.toContain('sticky');
  expect(container.querySelector('nav')?.className).not.toContain('border-b');
  act(() => root.unmount());
});

it('blocks destination changes while its owner has a non-cancellable operation', () => {
  const onChange = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <SettingsSubpageTabs
        activeId="import"
        ariaLabel="Transfer"
        disabled
        items={[
          { id: 'export', label: 'Export' },
          { id: 'import', label: 'Import' },
        ]}
        onChange={onChange}
      />
    )
  );

  const buttons = [...container.querySelectorAll('button')];
  expect(buttons.every((button) => button.disabled)).toBe(true);
  act(() => buttons[0]?.click());
  expect(onChange).not.toHaveBeenCalled();
  act(() => root.unmount());
});
