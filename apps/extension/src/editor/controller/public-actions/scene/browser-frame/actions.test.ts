import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsertBrowserFrameLayer: vi.fn(),
}));

vi.mock('./upsert', () => ({
  upsertBrowserFrameLayer: mocks.upsertBrowserFrameLayer,
}));

import { applyEditorBrowserFrameSettings } from './actions';

function createOptions() {
  return {
    browserFrame: { enabled: true, title: 'Next' },
    canvas: null,
    canvasDocumentSize: { height: 400, width: 600 },
    commitHistory: vi.fn(),
    ensureBrowserFrameOnTop: vi.fn(),
    relayoutScene: vi.fn(),
    source: null,
    store: {
      getBrowserFrame: vi.fn(() => ({ enabled: false, title: 'Current' })),
      getFrame: vi.fn(() => ({ padding: 0 })),
      setBrowserFrame: vi.fn(),
    },
    syncRuntimeState: vi.fn(),
  };
}

it('commits history only after browser-frame layer apply succeeds', async () => {
  const options = createOptions();
  mocks.upsertBrowserFrameLayer.mockResolvedValueOnce(true);

  await applyEditorBrowserFrameSettings(options as never);

  expect(options.store.setBrowserFrame).toHaveBeenCalledWith({ enabled: true, title: 'Next' });
  expect(options.commitHistory).toHaveBeenCalledOnce();
  expect(options.syncRuntimeState).toHaveBeenCalledOnce();
});

it('syncs runtime state without history when no layer can be applied', async () => {
  const options = createOptions();
  mocks.upsertBrowserFrameLayer.mockResolvedValueOnce(false);

  await applyEditorBrowserFrameSettings(options as never);

  expect(options.commitHistory).not.toHaveBeenCalled();
  expect(options.syncRuntimeState).toHaveBeenCalledOnce();
});
