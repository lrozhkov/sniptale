// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ exportPage: vi.fn(), stage: vi.fn() }));
vi.mock('../tab-access/capabilities', () => ({
  useActiveTabCapabilities: () => ({ tabId: 7 }),
}));
vi.mock('../runtime/page-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/page-access')>()),
  usePopupPageAccessRuntime: () => ({ status: null }),
}));
vi.mock('./selection/launch-selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./selection/launch-selection')>()),
  stagePopupExportLaunchSelection: mocks.stage,
}));
vi.mock('./pages/page', () => ({
  ExportPage: (props: unknown) => {
    mocks.exportPage(props);
    return <div data-testid="export-page" />;
  },
}));

import { ExportRoute } from './route';

it('owns Export launch selection and route-local capability state', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <ExportRoute
        startup={{
          page: 'export',
          destination: 'save',
          launchSelection: { includeAnnotations: true },
        }}
      />
    )
  );
  expect(mocks.stage).toHaveBeenCalledWith({ includeAnnotations: true });
  expect(mocks.exportPage).toHaveBeenCalledWith(
    expect.objectContaining({
      activeTabCapabilities: { tabId: 7 },
      initialDestination: 'save',
      isActive: true,
    })
  );
  act(() => root.unmount());
});

it('passes the tab-bound launch to Export without replacing saved settings', () => {
  mocks.stage.mockClear();
  const container = document.createElement('div');
  const root = createRoot(container);
  const launch = { tabId: 7, startExport: true };
  act(() =>
    root.render(<ExportRoute startup={{ page: 'export', destination: 'export', launch }} />)
  );
  expect(mocks.exportPage).toHaveBeenLastCalledWith(
    expect.objectContaining({ launch, initialDestination: 'export' })
  );
  expect(mocks.stage).not.toHaveBeenCalled();
  act(() => root.unmount());
});
