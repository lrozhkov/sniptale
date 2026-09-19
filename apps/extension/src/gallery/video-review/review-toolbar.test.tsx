// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimelineToolbar } from './review-toolbar';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { translate } from '../../platform/i18n';

it('opens the audio picker, reveals the imported lane, and keeps cancellation empty', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const onImportAudio = vi.fn();
  const setTrackVisibility = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ReviewTimelineToolbar
          advanced={advanced}
          busy={false}
          composerBusy={false}
          telemetryAvailable={false}
          selection={{ kind: 'point', time: 0 }}
          edits={[]}
          onImportAudio={onImportAudio}
          setTrackVisibility={setTrackVisibility}
          setOverlaysVisible={vi.fn()}
          onAddComment={vi.fn()}
          onAddOverlayComment={vi.fn()}
          onDownloadFragment={vi.fn()}
          editing={{
            mode: null,
            rate: 2,
            audio: 'speed',
            selected: false,
            exporter: { index: null, phase: 'idle' },
            setCutting: vi.fn(),
            toggle: vi.fn(),
            changeRate: vi.fn(),
            changeAudio: vi.fn(),
            remove: vi.fn(),
          }}
        />
      )
    );
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const open = vi.spyOn(input, 'click');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          `[aria-label="${translate('gallery.videoReview.audioImport')}"]`
        )!
        .click()
    );
    expect(open).toHaveBeenCalledOnce();
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(onImportAudio).not.toHaveBeenCalled();
    expect(setTrackVisibility).not.toHaveBeenCalled();
    const file = new File(['audio'], 'music.wav', { type: 'audio/wav' });
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(onImportAudio).toHaveBeenCalledWith(file);
    expect(setTrackVisibility).toHaveBeenCalledWith('audio', true);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
