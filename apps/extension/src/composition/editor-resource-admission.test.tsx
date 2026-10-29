// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorResourceAdmission } from './editor-resource-admission';
import { PageBootstrapErrorBoundary } from '../ui/page-bootstrap/page-bootstrap-error-boundary';
const harness = vi.hoisted(() => ({
  acquire: vi.fn(),
  prepare: vi.fn(async (): Promise<void> => undefined),
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

vi.mock('../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: harness.prepare,
}));

it('keeps the existing reader through preparation after unmount and never mounts a stale editor', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const release = vi.fn(async () => undefined);
  harness.acquire.mockResolvedValue({ release });
  harness.prepare.mockReturnValueOnce(pending);
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <EditorResourceAdmission root={{ rootKind: 'media', rootId: 'asset' }}>
        <span>editor</span>
      </EditorResourceAdmission>
    )
  );
  expect(host.querySelector('[role="status"]')).not.toBeNull();
  expect(host.textContent).not.toContain('editor');
  expect(release).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  expect(release).not.toHaveBeenCalled();
  await act(async () => {
    finish();
    await pending;
  });
  expect(release).toHaveBeenCalledOnce();
});

it('retries missing-byte preparation without mounting an unprotected editor', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const release = vi.fn(async () => undefined);
  harness.acquire.mockResolvedValue({ release });
  harness.prepare.mockRejectedValueOnce(new Error('Provider unavailable'));
  harness.prepare.mockResolvedValueOnce(undefined);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <EditorResourceAdmission root={{ rootKind: 'media', rootId: 'asset' }}>
          <span data-editor>editor</span>
        </EditorResourceAdmission>
      )
    );
    expect(host.querySelector('[data-editor]')).toBeNull();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(release).toHaveBeenCalledOnce();
    await act(async () => host.querySelector('button')?.click());
    expect(host.querySelector('[data-editor]')).not.toBeNull();
    expect(release).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
  }
  expect(release).toHaveBeenCalledTimes(2);
});
