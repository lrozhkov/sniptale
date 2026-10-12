// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useRecoveryLifecycle } from './use-recovery-lifecycle';
it('flushes lifecycle transitions and resumes, keeps the owner mounted, and detaches listeners', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values: boolean[] = [];
  function Owner() {
    const mounted = useRef(false);
    useRecoveryLifecycle(async () => {
      values.push(mounted.current);
      throw new Error('retryable');
    }, mounted);
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  try {
    await act(async () => root.render(<Owner />));
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(values).toEqual([true]);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await act(async () => root.unmount());
    expect(values).toEqual([true, true, true, true, false]);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    expect(values).toEqual([true, true, true, true, false]);
  } finally {
    visibility.mockRestore();
    vi.unstubAllGlobals();
  }
});
