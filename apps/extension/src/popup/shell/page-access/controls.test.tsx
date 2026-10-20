// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PageAccessControls } from './controls';

it('keeps complete access errors and all permission recovery actions', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  const message = 'Access failed. Retry the permission request. '.repeat(20);
  const onRequest = vi.fn();
  try {
    act(() =>
      root.render(
        <PageAccessControls
          disabled={false}
          error={message}
          onRequest={onRequest}
          pendingOperation={null}
          status={{
            supported: true,
            currentTabActive: false,
            currentTabOrigin: 'https://example.com',
            allSitesGranted: false,
            currentTabId: 1,
            siteGranted: false,
          }}
        />
      )
    );
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(message);
    expect(alert?.className).not.toContain('truncate');
    expect(alert?.hasAttribute('title')).toBe(false);
    expect(container.querySelectorAll('button')).toHaveLength(3);
    for (const button of container.querySelectorAll('button')) {
      act(() => button.click());
    }
    expect(onRequest).toHaveBeenCalledTimes(3);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
