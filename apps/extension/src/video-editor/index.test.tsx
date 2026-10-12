// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({
  acquire: vi.fn(),
  read: vi.fn(),
  render: vi.fn<(options: { element: ReactNode }) => unknown>(),
}));
vi.mock('../ui/page-bootstrap', () => ({ renderPageShell: harness.render }));
vi.mock('./shell/app', () => ({
  App: () => {
    harness.read();
    return null;
  },
}));
vi.mock('@sniptale/platform/observability/message-tracer', () => ({ initTracer: vi.fn() }));
vi.mock('../composition/persistence/assets/resource-sessions', () => ({
  acquireAssetResourceSession: harness.acquire,
}));

it('does not admit Montage bootstrap reads before the actual page acquires a resource reader', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let accept!: (session: { release(): Promise<void> }) => void;
  const held = new Promise<{ release(): Promise<void> }>((resolve) => {
    accept = resolve;
  });
  const release = vi.fn(async () => undefined);
  harness.acquire.mockReturnValue(held);
  const root = createRoot(document.createElement('div'));
  harness.render.mockImplementation((options) => {
    root.render(options.element);
    return root;
  });
  try {
    await act(async () => {
      await import('./index');
    });
    expect(harness.read).not.toHaveBeenCalled();
    await act(async () => {
      accept({ release });
      await held;
    });
    expect(harness.read).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    expect(release).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
