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

it('owns Export launch selection and route-local capability state', async () => {
  const { ExportRoute } = await import('./route');
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <ExportRoute startup={{ page: 'export', launchSelection: { includeAnnotations: true } }} />
    )
  );
  expect(mocks.stage).toHaveBeenCalledWith({ includeAnnotations: true });
  expect(mocks.exportPage).toHaveBeenCalledWith(
    expect.objectContaining({ activeTabCapabilities: { tabId: 7 }, isActive: true })
  );
  act(() => root.unmount());
});
