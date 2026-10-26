// @vitest-environment jsdom
import { act, useState } from 'react';
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

it('keeps full-header selection separate from mini actions and lane switches', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.tracks.zoom = true;
  const action = vi.fn();
  const enabled = vi.fn();
  function Fixture() {
    const [selected, select] = useState<'source' | 'zoom'>('source');
    return (
      <ReviewTrackControlsProvider
        value={{
          ui: advanced.ui,
          configuring: true,
          busy: false,
          unavailable: {},
          setEnabled: enabled,
          selectedTrack: selected,
          selectTrack: (track) => {
            if (track === 'source' || track === 'zoom') select(track);
          },
        }}
      >
        <ReviewTrackRow track="source" label="Source">
          <div />
        </ReviewTrackRow>
        <ReviewTrackRow
          track="zoom"
          label="Focus"
          controls={<button onClick={action}>Mini action</button>}
        >
          <div />
        </ReviewTrackRow>
      </ReviewTrackControlsProvider>
    );
  }
  try {
    await act(async () => root.render(<Fixture />));
    const source = host.querySelector<HTMLElement>('[data-review-header-track="source"]')!;
    const focus = host.querySelector<HTMLElement>('[data-review-header-track="zoom"]')!;
    expect(source.getAttribute('data-review-header-selected')).toBe('true');
    await act(async () =>
      [...focus.querySelectorAll('button')]
        .find((node) => node.textContent === 'Mini action')!
        .click()
    );
    expect(action).toHaveBeenCalledOnce();
    expect(source.getAttribute('data-review-header-selected')).toBe('true');
    await act(async () =>
      focus.querySelector<HTMLButtonElement>('[data-review-track-select]')!.click()
    );
    expect(source.getAttribute('data-review-header-selected')).toBe('false');
    expect(focus.getAttribute('data-review-header-selected')).toBe('true');
    expect(focus.querySelector('[data-review-track-select]')?.getAttribute('aria-pressed')).toBe(
      'true'
    );
    await act(async () => focus.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    expect(enabled).toHaveBeenCalledWith('zoom', false);
    expect(focus.getAttribute('data-review-header-selected')).toBe('true');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
