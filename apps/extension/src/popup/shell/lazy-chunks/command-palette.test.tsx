// @vitest-environment jsdom

import { Suspense } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createPopupAppShellRuntime } from '../app-shell/test-support/runtime';

const commandPalette = vi.hoisted(() => vi.fn(() => <div data-testid="command-palette" />));

vi.mock('../command-palette', () => ({ default: commandPalette }));
vi.mock('../../diagnostics/performance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../diagnostics/performance')>()),
  trackPopupPerfAsync: (_: string, loader: () => Promise<unknown>) => loader(),
}));

it('loads the command palette only when its lazy component is rendered', async () => {
  const { LazyPopupCommandPalette } = await import('./index');
  const container = document.createElement('div');
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <Suspense fallback={null}>
        <LazyPopupCommandPalette isOpen onClose={vi.fn()} runtime={createPopupAppShellRuntime()} />
      </Suspense>
    );
  });

  expect(container.querySelector('[data-testid="command-palette"]')).not.toBeNull();
  expect(commandPalette).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});
