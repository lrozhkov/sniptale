// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewTrackSelection } from './timeline-track-selection';
import { ReviewTrackControlsProvider, ReviewTrackRow } from './track-row';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
it('retains a drawing tool on its active lane and focuses another item before its own gesture', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  advanced.ui.tracks.text = true;
  const events: string[] = [];
  const activate = vi.fn();
  let selection!: ReturnType<typeof useReviewTrackSelection>;
  function Fixture() {
    selection = useReviewTrackSelection({
      sourceId: 'source',
      mode: 'advanced',
      editing: false,
      selectable: {
        source: true,
        cursorMotion: true,
        zoom: true,
        text: true,
        actions: true,
        originalAudio: true,
        voiceover: true,
        music: true,
        webcam: true,
        annotationEffects: true,
      },
      blocked: false,
      beforeAction: undefined,
      clearTools: () => events.push('clear'),
      activate,
    });
    return (
      <ReviewTrackControlsProvider
        value={{
          ui: advanced.ui,
          configuring: false,
          selectedTrack: selection.track,
          selectTrack: selection.select,
          focusItemTrack: selection.focusItem,
          busy: false,
          unavailable: {},
          setEnabled: vi.fn(),
        }}
      >
        <ReviewTrackRow track="zoom" label="Focus">
          <div data-empty />
        </ReviewTrackRow>
        <ReviewTrackRow track="text" label="Text">
          <button data-review-removal-key="text:one" onPointerDown={() => events.push('item')}>
            Phrase
          </button>
        </ReviewTrackRow>
      </ReviewTrackControlsProvider>
    );
  }
  try {
    await act(async () => root.render(<Fixture />));
    await act(async () => selection.select('zoom'));
    events.length = 0;
    activate.mockClear();
    await act(async () =>
      host
        .querySelector('[data-empty]')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    );
    expect(events).toEqual([]);
    expect(activate).not.toHaveBeenCalled();
    expect(selection.track).toBe('zoom');
    await act(async () =>
      host
        .querySelector('[data-review-removal-key]')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    );
    expect(selection.track).toBe('text');
    expect(events).toEqual(['clear', 'item']);
    expect(activate).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it('does not apply an admitted old track request to a different source', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let sourceId = 'old';
  let request: (() => void) | undefined;
  const activate = vi.fn(),
    clearTools = vi.fn();
  let selection!: ReturnType<typeof useReviewTrackSelection>;
  function Fixture() {
    selection = useReviewTrackSelection({
      sourceId,
      mode: 'basic',
      editing: false,
      selectable: {
        source: true,
        cursorMotion: true,
        zoom: true,
        text: true,
        actions: true,
        originalAudio: true,
        voiceover: true,
        music: true,
        webcam: true,
        annotationEffects: true,
      },
      blocked: false,
      beforeAction: (action) => {
        request = action;
      },
      clearTools,
      activate,
    });
    return null;
  }
  try {
    await act(async () => root.render(<Fixture />));
    selection.select('text');
    sourceId = 'new';
    await act(async () => root.render(<Fixture />));
    clearTools.mockClear();
    await act(async () => request?.());
    expect(activate).not.toHaveBeenCalled();
    expect(selection.track).toBe('source');
    expect(clearTools).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('notifies the inspector within the admitted selection handler before activation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const events: string[] = [];
  let selection!: ReturnType<typeof useReviewTrackSelection>;
  function Fixture() {
    selection = useReviewTrackSelection({
      sourceId: 'same',
      mode: 'advanced',
      editing: false,
      selectable: {
        source: true,
        cursorMotion: true,
        zoom: true,
        text: true,
        actions: true,
        originalAudio: true,
        voiceover: true,
        music: true,
        webcam: true,
        annotationEffects: true,
      },
      blocked: false,
      beforeAction: undefined,
      clearTools: () => {},
      onChange: (track) => events.push(`notify:${track}`),
      activate: (track) => events.push(`activate:${track}`),
    });
    return null;
  }
  try {
    await act(async () => root.render(<Fixture />));
    events.length = 0;
    await act(async () => selection.select('zoom'));
    expect(events).toEqual(['notify:zoom', 'activate:zoom']);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
