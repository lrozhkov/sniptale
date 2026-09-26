// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock('../../platform/navigation/extension-pages/scenario-editor', () => ({
  buildScenarioEditorUrl: () => 'https://extension.test/editor',
}));
vi.mock('./runtime/viewer', async (original) => ({
  ...(await original<typeof import('./runtime/viewer')>()),
  prepareScenarioView: io.prepare,
}));
vi.mock('./tour/export-preview', () => ({
  TourExportPreview: ({ title }: { title: string }) => <p>{title}</p>,
}));
import { ScenarioViewerPage } from './viewer';
const host = document.createElement('div');
let root = createRoot(host);
afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
  vi.resetAllMocks();
});
it('keeps an open artifact stable and rereads only on refresh; cancels obsolete work', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const route = { mode: 'guide' as const, projectId: 'p' };
  io.prepare.mockResolvedValue({
    status: 'ready',
    name: 'First',
    revision: 1,
    blob: new Blob(['a']),
  });
  await act(async () => root.render(<ScenarioViewerPage route={route} />));
  expect(host.textContent).toContain('First');
  await act(async () => root.render(<ScenarioViewerPage route={route} />));
  expect(io.prepare).toHaveBeenCalledTimes(1);
  io.prepare.mockResolvedValueOnce({
    status: 'ready',
    name: 'Updated',
    revision: 2,
    blob: new Blob(['b']),
  });
  await act(async () => host.querySelector('button')?.click());
  expect(host.textContent).toContain('Updated');
  expect(io.prepare.mock.calls[0]![0].signal.aborted).toBe(true);
  io.prepare.mockRejectedValueOnce(new Error('missing media'));
  await act(async () => host.querySelector('button')?.click());
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(host.textContent).not.toContain('Updated');
});
it('cancels preparation and ignores a late result', async () => {
  let finish: (value: unknown) => void = () => {};
  io.prepare.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await act(async () =>
    root.render(<ScenarioViewerPage route={{ mode: 'tour', projectId: 'p' }} />)
  );
  const buttons = host.querySelectorAll('button');
  expect(buttons[0]?.disabled).toBe(true);
  await act(async () => buttons[1]?.click());
  await act(async () =>
    finish({ status: 'ready', name: 'Stale', revision: 1, blob: new Blob(['a']) })
  );
  expect(host.textContent).not.toContain('Stale');
  expect(io.prepare.mock.calls[0]![0].signal.aborted).toBe(true);
  expect(host.querySelector('button')?.disabled).toBe(false);
});
it('does not prepare an invalid route', async () => {
  await act(async () => root.render(<ScenarioViewerPage route={{ mode: 'invalid' }} />));
  expect(io.prepare).not.toHaveBeenCalled();
  expect(host.querySelector('[role=alert]')).not.toBeNull();
});
