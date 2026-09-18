// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import { ReviewVoiceoverRecording, useReviewVoiceoverRecording } from './voiceover-recording';
import type { AudioTrimRange } from '../../composition/audio-recording/session-types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../workflows/video-review/audio-import', () => ({
  importAudioAsset: vi.fn(async () => ({ assetId: 'project-asset:7', duration: 2 })),
  importedAudioClip: (
    assetId: string,
    duration: number,
    atTime: number,
    timelineDuration: number
  ) => ({
    assetId,
    duration,
    atTime,
    timelineDuration,
    lane: 'voiceover',
  }),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderRecording = (isOpen: boolean) => {
  const onClose = vi.fn();
  const onSave = vi.fn(async () => undefined);
  act(() => {
    root.render(
      <ReviewVoiceoverRecording
        isOpen={isOpen}
        playhead={3}
        timelineDuration={10}
        onClose={onClose}
        onSyncStart={vi.fn(async () => undefined)}
        onSyncStop={vi.fn()}
        onSave={onSave}
      />
    );
  });
  return { onClose, onSave };
};

it('mounts the shared recorder with the remaining timeline as the capture limit', () => {
  renderRecording(true);
  const modal = host.querySelector('[role="dialog"]');
  expect(modal).not.toBeNull();
  expect(modal!.textContent).toContain('gallery.videoReview.recordVoiceover');
  expect(modal!.textContent).toContain('videoEditor.app.recordAudioStart');
});

it('stays closed when isOpen is false', () => {
  renderRecording(false);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

type RecordingApi = ReturnType<typeof useReviewVoiceoverRecording>;

function renderHookHarness(props: {
  guard: () => boolean;
  run?: (action: () => Promise<unknown>) => Promise<unknown>;
}) {
  let latest!: RecordingApi;
  const node = {
    currentTime: 0,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
  const video = { current: node } as RefObject<HTMLVideoElement | null>;
  const audio = { addImported: vi.fn() } as unknown as Parameters<
    typeof useReviewVoiceoverRecording
  >[0]['audio'];
  const Harness = () => {
    latest = useReviewVoiceoverRecording({
      video,
      time: 3,
      sourceDuration: 10,
      audio,
      run: props.run ?? (async (action) => action()),
      guard: props.guard,
    });
    return null;
  };
  act(() => root.render(<Harness />));
  return {
    get latest() {
      return latest;
    },
    node,
    audio,
  };
}

const trim: AudioTrimRange = { trimStart: 0, trimEnd: 1 };

it('opens only when the guard allows and closes on demand', () => {
  const harness = renderHookHarness({ guard: () => true });
  act(() => harness.latest.open());
  expect(harness.latest.recording).toBe(true);
  act(() => harness.latest.close());
  expect(harness.latest.recording).toBe(false);
});

it('ignores the record intent while the editor cannot start', () => {
  const harness = renderHookHarness({ guard: () => false });
  act(() => harness.latest.open());
  expect(harness.latest.recording).toBe(false);
});

it('syncs playback to the playhead and pauses on stop', async () => {
  const harness = renderHookHarness({ guard: () => true });
  await act(async () => harness.latest.syncStart());
  expect(harness.node.currentTime).toBe(3);
  expect(harness.node.play).toHaveBeenCalledOnce();
  act(() => harness.latest.syncStop());
  expect(harness.node.pause).toHaveBeenCalledOnce();
});

it('swallows autoplay rejection and tolerates a missing video node', async () => {
  const failing = {
    currentTime: 0,
    play: vi.fn(async () => Promise.reject(new Error('no'))),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
  let latest!: RecordingApi;
  const audio = { addImported: vi.fn() } as unknown as Parameters<
    typeof useReviewVoiceoverRecording
  >[0]['audio'];
  let video: RefObject<HTMLVideoElement | null> = {
    current: failing,
  } as RefObject<HTMLVideoElement | null>;
  const Harness = () => {
    latest = useReviewVoiceoverRecording({
      video,
      time: 1,
      sourceDuration: 4,
      audio,
      run: async (action) => action(),
      guard: () => true,
    });
    return null;
  };
  act(() => root.render(<Harness />));
  await act(async () => latest.syncStart());
  expect(failing.currentTime).toBe(1);
  video = { current: null } as RefObject<HTMLVideoElement | null>;
  act(() => root.render(<Harness />));
  await act(async () => latest.syncStart());
  expect(latest.recording).toBe(false);
});

it('skips saving when the session was already aborted', async () => {
  const run = vi.fn(async (action: () => Promise<unknown>) => action());
  const harness = renderHookHarness({ guard: () => true, run });
  const controller = new AbortController();
  controller.abort();
  await act(async () => harness.latest.save(new File(['a'], 'a.webm'), trim, controller.signal));
  expect(run).not.toHaveBeenCalled();
  expect(harness.audio.addImported).not.toHaveBeenCalled();
});

it('imports the recording and adds a bounded voiceover clip at the playhead', async () => {
  const run = vi.fn(async (action: () => Promise<unknown>) => action());
  const harness = renderHookHarness({ guard: () => true, run });
  await act(async () =>
    harness.latest.save(new File(['a'], 'a.webm'), trim, new AbortController().signal)
  );
  expect(run).toHaveBeenCalledOnce();
  expect(harness.audio.addImported).toHaveBeenCalledWith(
    expect.objectContaining({
      assetId: 'project-asset:7',
      duration: 2,
      atTime: 3,
      timelineDuration: 10,
    }),
    'voiceover'
  );
});
