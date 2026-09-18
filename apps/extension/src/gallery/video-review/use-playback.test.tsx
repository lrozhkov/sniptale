// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewPlayback } from './use-playback';

it('previews cuts, speed and mute in source time, restores audio, and cancels its frame loop', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const cancel = vi.fn();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 7)
  );
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewPlayback>;
  function Harness() {
    hook = useReviewPlayback({
      duration: 10,
      boundaries: () => [0, 2, 4, 6, 8, 10],
      edits: [
        { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
        {
          id: 'speed',
          kind: 'speed',
          start: 4,
          end: 6,
          requestedStart: 4,
          requestedEnd: 6,
          rate: 4,
          audio: 'mute',
        },
      ],
      onSeek: vi.fn(),
      onFailure: vi.fn(),
      original: { muted: false, volume: 0.25 },
    });
    return <video ref={hook.video} />;
  }
  try {
    act(() => root.render(<Harness />));
    act(() => hook.seek(2.7));
    expect(hook.time).toBe(2);
    act(() => hook.seek(2.7, false));
    expect(hook.time).toBe(2.7);
    act(() => hook.setPlaying(true));
    act(() => hook.onTime(2.7));
    expect(hook.time).toBe(4);
    expect(hook.video.current!.playbackRate).toBe(4);
    expect(hook.video.current!.muted).toBe(true);
    expect(hook.video.current!.preservesPitch).toBe(false);
    act(() => hook.onTime(6));
    expect(hook.video.current!.playbackRate).toBe(1);
    expect(hook.video.current!.muted).toBe(false);
    expect(hook.video.current!.volume).toBe(0.25);
    act(() => hook.onTime(10));
    expect(pause).toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    expect(cancel).toHaveBeenCalledWith(7);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
