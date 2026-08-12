// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SettingsCollectionHeader } from './header';

it('keeps collection controls and the add action in one toolbar', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onInvoke = vi.fn();
  act(() =>
    root.render(
      <SettingsCollectionHeader
        addAction={{ label: 'Добавить', onInvoke }}
        toolbarControls={<input aria-label="Поиск" />}
      />
    )
  );

  const toolbar = container.querySelector('[data-ui="settings.collection.toolbar"]');
  expect(toolbar?.querySelector('[aria-label="Поиск"]')).not.toBeNull();
  expect(toolbar?.textContent).toContain('Добавить');
  act(() => toolbar?.querySelector<HTMLButtonElement>('button')?.click());
  expect(onInvoke).toHaveBeenCalledOnce();
  act(() => root.unmount());
});
