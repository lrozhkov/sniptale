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

it('selects an empty lane before its gesture without consuming controls, items or the surrounding gap', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.tracks.text = true;
  const select = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ReviewTrackControlsProvider
          value={{
            ui: advanced.ui,
            configuring: false,
            busy: false,
            unavailable: {},
            setEnabled: vi.fn(),
            selectedTrack: 'source',
            selectTrack: select,
          }}
        >
          <ReviewTrackRow track="text" label="Text">
            <div data-empty-lane>
              <button>Existing control</button>
              <div role="button">Existing fragment</div>
            </div>
          </ReviewTrackRow>
          <div data-lane-gap />
        </ReviewTrackControlsProvider>
      )
    );
    const pointer = async (node: Element, button = 0) =>
      act(async () => {
        node.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button }));
      });
    await pointer(host.querySelector('[data-empty-lane]')!);
    expect(select).toHaveBeenCalledExactlyOnceWith('text');
    select.mockClear();
    await pointer(host.querySelector('[data-empty-lane] button')!);
    await pointer(host.querySelector('[role="button"]')!);
    await pointer(host.querySelector('[data-lane-gap]')!);
    await pointer(host.querySelector('[data-empty-lane]')!, 2);
    expect(select).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('allows creation-track selection while its master is off in configuration mode', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.tracks.voiceover = false;
  const select = vi.fn();
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
            selectedTrack: 'source',
            selectTrack: select,
            selectable: { voiceover: true },
          }}
        >
          <ReviewTrackRow track="voiceover" label="Voiceover">
            <div data-empty-lane />
          </ReviewTrackRow>
        </ReviewTrackControlsProvider>
      )
    );
    const button = host.querySelector<HTMLButtonElement>('[data-review-track-select]')!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(select).toHaveBeenCalledExactlyOnceWith('voiceover');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
