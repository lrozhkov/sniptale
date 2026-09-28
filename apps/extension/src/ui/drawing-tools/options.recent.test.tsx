// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  load: vi.fn<() => Promise<string[]>>(),
  push: vi.fn(async () => [] as string[]),
  subscribe: vi.fn(() => () => undefined),
}));

vi.mock('../../composition/persistence/recent-colors', () => ({
  loadRecentColors: persistence.load,
  pushRecentColor: persistence.push,
  subscribeRecentColors: persistence.subscribe,
}));

import { DrawingColorOptions } from './options';

it('keeps a color picked before the saved recents finish loading at the front', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let finishLoad: ((colors: string[]) => void) | undefined;
  persistence.load.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishLoad = resolve;
      })
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  act(() =>
    root.render(
      <DrawingColorOptions
        colors={['#f97316', '#60a5fa', '#22c55e', '#facc15', '#ef4444', '#111827']}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        label="Line color"
        value="#f97316"
        onSelect={onSelect}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button[title="#60a5fa"]')?.click());
  expect(onSelect).toHaveBeenCalledWith('#60a5fa');
  await act(async () => finishLoad?.(['#ffffff', '#111827']));
  expect(host.querySelector('.grid-cols-5 button')?.getAttribute('title')).toBe('#60a5fa');
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
