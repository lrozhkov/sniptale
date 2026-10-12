// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useRecoveryLifecycle } from './use-recovery-lifecycle';
it('flushes hidden documents and unmounts, clears mounted before the final flush, and detaches listeners', async () => {
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
    expect(values).toEqual([]);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => root.unmount());
    expect(values).toEqual([true, false]);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(values).toEqual([true, false]);
  } finally {
    visibility.mockRestore();
    vi.unstubAllGlobals();
  }
});
