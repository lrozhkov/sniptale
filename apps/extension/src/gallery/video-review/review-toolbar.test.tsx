// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimelineToolbar } from './review-toolbar';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { translate } from '../../platform/i18n';

it('groups workspace toggles before editing tools and switches mode without changing lane visibility', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const setMode = vi.fn();
  const setTrackVisibility = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ReviewTimelineToolbar
          advanced={advanced}
          busy={false}
          composerBusy={false}

          selection={{ kind: 'point', time: 0 }}
          edits={[]}

          telemetryAvailable
          setTrackVisibility={setTrackVisibility}
          setMode={setMode}
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
      )
    );
    const tools = host.querySelector('[data-ui="gallery.videoReview.workspaceTools"]')!;
    const mode = tools.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.advancedEditing')}"]`
    )!;
    expect(mode.getAttribute('aria-pressed')).toBe('true');
    await act(async () => mode.click());
    expect(setMode).toHaveBeenCalledWith('basic');
    expect(setTrackVisibility).not.toHaveBeenCalled();
    expect(host.querySelector('input[type="file"]')).toBeNull();
    expect(host.querySelector('[data-ui="gallery.videoReview.editingTools"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
