// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const portal = vi.hoisted(() => ({
  container: null as HTMLDivElement | null,
  useFixedPortalContainer: vi.fn(),
}));

vi.mock('../layout/portal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layout/portal')>()),
  useFixedPortalContainer: portal.useFixedPortalContainer,
}));

import { InteractiveFrameSizePanelPortal } from './portal';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  portal.container?.remove();
  portal.container = null;
  host = null;
  root = null;
  portal.useFixedPortalContainer.mockReset();
});

it('renders the size controls in their dedicated interactive portal', () => {
  host = document.createElement('div');
  portal.container = document.createElement('div');
  document.body.append(host, portal.container);
  portal.useFixedPortalContainer.mockReturnValue(portal.container);
  root = createRoot(host);

  act(() => {
    root?.render(
      <InteractiveFrameSizePanelPortal>
        <button type="button">Increase width</button>
      </InteractiveFrameSizePanelPortal>
    );
  });

  expect(portal.useFixedPortalContainer).toHaveBeenCalledWith(
    'sniptale-frame-size-panel-portal',
    expect.stringContaining('pointer-events: none'),
    null
  );
  expect(portal.container.querySelector('button')?.textContent).toBe('Increase width');
  expect(host.querySelector('button')).toBeNull();
});
