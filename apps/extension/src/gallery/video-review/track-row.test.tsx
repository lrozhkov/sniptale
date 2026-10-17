// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { ReviewTrackControlsProvider, ReviewTrackRow } from './track-row';

it('keeps a checked unavailable source switch in the settings grid and removes lock commands', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.lockedTracks = { source: true };
  try {
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{
            ui: advanced.ui,
            configuring: true,
            busy: false,
            unavailable: {},
            setEnabled: vi.fn(),
          }}
        >
          <ReviewTrackRow track="source" label="Source">
            <div />
          </ReviewTrackRow>
        </ReviewTrackControlsProvider>
      )
    );
    const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.disabled).toBe(true);
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-review-track-locked="true"]')).toBeNull();
    expect(
      host.querySelectorAll('[aria-label*="trackLock"],[aria-label*="trackUnlock"]')
    ).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
