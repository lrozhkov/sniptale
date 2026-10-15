// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorResourceAdmission } from './editor-resource-admission';
import { PageBootstrapErrorBoundary } from '../ui/page-bootstrap/page-bootstrap-error-boundary';
const harness = vi.hoisted(() => ({
  acquire: vi.fn(),
}));
vi.mock('./persistence/assets/resource-sessions', () => ({
  acquireAssetResourceSession: harness.acquire,
}));
afterEach(() => vi.unstubAllGlobals());

it('uses the existing fatal boundary without mounting an unprotected editor on acquisition failure', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  harness.acquire.mockRejectedValueOnce(new Error('Native coordination failed'));
  const error = vi.fn();
  const read = vi.fn();
  function Child() {
    useEffect(() => {
      read();
    }, []);
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await act(async () =>
      root.render(
        <PageBootstrapErrorBoundary onError={error}>
          <EditorResourceAdmission>
            <Child />
          </EditorResourceAdmission>
        </PageBootstrapErrorBoundary>
      )
    );
    expect(error).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(read).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    consoleError.mockRestore();
  }
});

it.each(['admitted', 'unmounted-before-admission'] as const)(
  'does not read children before protection: %s',
  async (state) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let accept!: (session: { release(): Promise<void> }) => void;
    const ready = new Promise<{ release(): Promise<void> }>((resolve) => {
      accept = resolve;
    });
    const release = vi.fn(async () => undefined);
    const read = vi.fn();
    harness.acquire.mockReturnValue(ready);
    function Child() {
      useEffect(() => {
        read();
      }, []);
      return <span>editor</span>;
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <EditorResourceAdmission>
          <Child />
        </EditorResourceAdmission>
      )
    );
    expect(read).not.toHaveBeenCalled();
    if (state === 'unmounted-before-admission') await act(async () => root.unmount());
    await act(async () => {
      accept({ release });
      await ready;
    });
    if (state === 'admitted') {
      expect(read).toHaveBeenCalledOnce();
      await act(async () => root.unmount());
    } else expect(read).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  }
);
