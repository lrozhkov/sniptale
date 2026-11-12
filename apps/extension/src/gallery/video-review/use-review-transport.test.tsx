// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { useReviewPlayback } from './use-playback';
import { useReviewTransport } from './use-review-transport';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { workspace } from '../../composition/persistence/review-workspaces/backup-restore.test-support';

const bridge = vi.hoisted(() => ({
  video: { current: null as HTMLVideoElement | null },
  options: undefined as Parameters<typeof useReviewPlayback>[0] | undefined,
  play: vi.fn(),
  preparePlayback: vi.fn(async () => true),
  startPlayback: vi.fn(),
  stopPlayback: vi.fn(),
}));
vi.mock('./use-playback', () => ({
  useReviewPlayback(options: Parameters<typeof useReviewPlayback>[0]) {
    bridge.options = options;
    return { video: bridge.video, time: 0, playing: false, seekRevision: 0, play: bridge.play };
  },
}));
vi.mock('./use-review-audio-runtime', () => ({
  useReviewEditorAudioRuntime: () => bridge,
}));
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function mount(silent = false) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  bridge.preparePlayback.mockResolvedValue(true);
  bridge.video.current = document.createElement('video');
  const snapshot = { workspace: structuredClone(workspace), draft: null };
  const session = createVideoReviewSession(snapshot);
  const root = createRoot(document.createElement('div'));
  const failure = vi.fn();
  let hook!: ReturnType<typeof useReviewTransport>;
  function Probe() {
    hook = useReviewTransport({
      resource: {
        source: workspace.source,
        file: new File([], 'source.webm'),
        filename: 'source.webm',
        snapshot,
        session,
        url: 'blob:source',
        telemetry: null,
      },
      edits: [],
      originalAudio: workspace.advanced.audio.original,
      voiceover: [],
      music: [],
      onSeek: vi.fn(),
      boundaries: () => undefined,
      onTransportFailure: failure,
      silent,
    });
    return null;
  }
  act(() => root.render(<Probe />));
  cleanup = async () => {
    act(() => root.unmount());
    await session.dispose();
  };
  return { get: () => hook, failure };
}
it('waits for audio readiness and refuses Play when preparation fails', async () => {
  const mounted = mount();
  bridge.preparePlayback.mockResolvedValueOnce(false);
  await act(async () => mounted.get().play());
  expect(bridge.play).not.toHaveBeenCalled();
  await act(async () => mounted.get().play());
  expect(bridge.preparePlayback).toHaveBeenCalledTimes(2);
  expect(bridge.play).toHaveBeenCalledOnce();
  await expect(bridge.options!.prepareAfterSeek!()).resolves.toBe(true);
  bridge.options!.onPreparedPlay!();
  expect(bridge.startPlayback).toHaveBeenCalledOnce();
});
it('stops scheduled audio before pausing the native video transport', async () => {
  const mounted = mount();
  Object.defineProperty(bridge.video.current!, 'paused', { value: false });
  await act(async () => mounted.get().play());
  expect(bridge.preparePlayback).not.toHaveBeenCalled();
  expect(bridge.stopPlayback).toHaveBeenCalledOnce();
  expect(bridge.stopPlayback.mock.invocationCallOrder[0]).toBeLessThan(
    bridge.play.mock.invocationCallOrder[0]!
  );
  const pause = vi.spyOn(bridge.video.current!, 'pause').mockImplementation(() => {});
  bridge.options!.onFailure();
  expect(pause).toHaveBeenCalledOnce();
  expect(mounted.failure).toHaveBeenCalledOnce();
});
it('does not prepare audible playback for a silent preview', async () => {
  const mounted = mount(true);
  await act(async () => mounted.get().play());
  expect(bridge.preparePlayback).not.toHaveBeenCalled();
  expect(bridge.play).toHaveBeenCalledOnce();
});
