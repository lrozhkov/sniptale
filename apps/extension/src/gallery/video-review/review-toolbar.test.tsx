// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimelineToolbar, ReviewTrackControls } from './review-toolbar';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { translate } from '../../platform/i18n';

it('moves the mode switch between the labelled toolbar and first compact lane control', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  const setMode = vi.fn();
  const setTrackVisibility = vi.fn();
  const render = async (mode: 'basic' | 'advanced', busy = false) => {
    advanced.ui.mode = mode;
    const controls = { advanced, busy, setMode, setTrackVisibility, telemetryAvailable: true };
    await act(async () =>
      root.render(
        <>
          <ReviewTimelineToolbar
            {...controls}
            composerBusy={false}
            selection={{ kind: 'point', time: 0 }}
            edits={[]}
            onDownloadFragment={vi.fn()}
            editing={{
              mode: null,
              rate: 2,
              audio: 'speed',
              selected: false,
              exporter: { index: null, phase: 'idle' },
              setCutting: vi.fn(),
              toggle: vi.fn(),
              canApply: vi.fn(() => true),
              changeRate: vi.fn(),
              changeAudio: vi.fn(),
              remove: vi.fn(),
            }}
          />
          <ReviewTrackControls {...controls} />
        </>
      )
    );
  };
  const modeButton = () => {
    const buttons = host.querySelectorAll<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.advancedEditing')}"]`
    );
    expect(buttons).toHaveLength(1);
    return buttons[0]!;
  };
  try {
    await render('basic');
    expect(modeButton().closest('[data-ui="gallery.videoReview.workspaceTools"]')).not.toBeNull();
    expect(modeButton().textContent).toBe(translate('gallery.videoReview.advancedEditing'));
    expect(modeButton().getAttribute('aria-pressed')).toBe('false');
    await act(async () => modeButton().click());
    expect(setMode).toHaveBeenLastCalledWith('advanced');

    await render('advanced');
    const tracks = host.querySelector('[data-ui="gallery.videoReview.trackControls"]')!;
    expect(tracks.querySelector('button')).toBe(modeButton());
    expect(modeButton().textContent).toBe('');
    expect(modeButton().getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-ui="gallery.videoReview.workspaceTools"]')).toBeNull();
    await act(async () => modeButton().click());
    expect(setMode).toHaveBeenLastCalledWith('basic');

    await render('advanced', true);
    expect(modeButton().disabled).toBe(true);
    await act(async () => modeButton().click());
    expect(setMode).toHaveBeenCalledTimes(2);

    await render('basic');
    expect(modeButton().closest('[data-ui="gallery.videoReview.workspaceTools"]')).not.toBeNull();
    expect(modeButton().textContent).toBe(translate('gallery.videoReview.advancedEditing'));
    expect(host.querySelector('[data-ui="gallery.videoReview.trackControls"]')).toBeNull();
    expect(setTrackVisibility).not.toHaveBeenCalled();
    expect(host.querySelector('[data-ui="gallery.videoReview.editingTools"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
