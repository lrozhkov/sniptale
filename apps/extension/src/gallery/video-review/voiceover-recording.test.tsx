// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import { ReviewVoiceoverRecording, useReviewVoiceoverRecording } from './voiceover-recording';
import { importReviewAudio } from '../../workflows/video-review/audio-import';
import type { AudioTrimRange } from '../../composition/audio-recording/session-types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../workflows/video-review/audio-import', () => ({
  importReviewAudio: vi.fn(
    async (args: {
      signal: AbortSignal;
      assertCurrentTarget(): void;
      attach(assetId: string, duration: number): Promise<void>;
    }) => {
      args.signal.throwIfAborted();
      args.assertCurrentTarget();
      await args.attach('project-asset:7', 2);
    }
  ),
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
  time?: { current: number };
  flushAdvanced?: () => Promise<void>;
  toOutputTime?: (source: number) => number | null;
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
      time: props.time?.current ?? 3,
      resultDuration: 10,
      toOutputTime: props.toOutputTime ?? ((source: number) => source),
      audio,
      guard: props.guard,
      flushAdvanced: props.flushAdvanced ?? (async () => undefined),
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
    Harness,
  };
}

const trim: AudioTrimRange = { trimStart: 0, trimEnd: 1 };

it('opens only when the guard allows and captures the take start', () => {
  const harness = renderHookHarness({ guard: () => true });
  act(() => harness.latest.open());
  expect(harness.latest.recording).toBe(true);
  expect(harness.latest.takeStart).toBe(3);
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

it('rejects sync start when the source playback fails', async () => {
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
      resultDuration: 4,
      toOutputTime: (source: number) => source,
      audio,
      guard: () => true,
      flushAdvanced: async () => undefined,
    });
    return null;
  };
  act(() => root.render(<Harness />));
  await expect(act(async () => latest.syncStart())).rejects.toThrow('no');
  video = { current: null } as RefObject<HTMLVideoElement | null>;
  act(() => root.render(<Harness />));
  await act(async () => latest.syncStart());
  expect(latest.recording).toBe(false);
});

it('skips saving when the session was already aborted', async () => {
  const harness = renderHookHarness({ guard: () => true });
  const controller = new AbortController();
  controller.abort();
  await act(async () => harness.latest.save(new File(['a'], 'a.webm'), trim, controller.signal));
  expect(importReviewAudio).not.toHaveBeenCalled();
  expect(harness.audio.addImported).not.toHaveBeenCalled();
});

it('places the take at its start plus the trim offset after the transport advanced (V1)', async () => {
  const flushAdvanced = vi.fn(async () => undefined);
  const time = { current: 3 };
  const harness = renderHookHarness({ guard: () => true, time, flushAdvanced });
  act(() => harness.latest.open());
  time.current = 7;
  act(() => root.render(<harness.Harness />));
  await act(async () =>
    harness.latest.save(
      new File(['a'], 'a.webm'),
      { trimStart: 1, trimEnd: 3 },
      new AbortController().signal
    )
  );
  expect(harness.audio.addImported).toHaveBeenCalledWith(
    expect.objectContaining({
      assetId: 'project-asset:7',
      duration: 2,
      atTime: 4,
      timelineDuration: 10,
    }),
    'voiceover',
    2
  );
  expect(flushAdvanced).toHaveBeenCalledOnce();
});

it('places the take through the output-time map (R03)', async () => {
  const harness = renderHookHarness({ guard: () => true, toOutputTime: (t) => t - 2 });
  act(() => harness.latest.open());
  await act(async () =>
    harness.latest.save(
      new File(['a'], 'a.webm'),
      { trimStart: 1, trimEnd: 3 },
      new AbortController().signal
    )
  );
  expect(harness.audio.addImported).toHaveBeenCalledWith(
    expect.objectContaining({ atTime: 2, timelineDuration: 10 }),
    'voiceover',
    2
  );
});

it('refuses the take when its start was removed by the cuts (R03)', async () => {
  const harness = renderHookHarness({ guard: () => true, toOutputTime: () => null });
  act(() => harness.latest.open());
  await expect(
    act(async () =>
      harness.latest.save(
        new File(['a'], 'a.webm'),
        { trimStart: 1, trimEnd: 3 },
        new AbortController().signal
      )
    )
  ).rejects.toThrow('gallery.videoReview.placementOnCut');
  expect(harness.audio.addImported).not.toHaveBeenCalled();
});

it('rejects the save when the import fails so the take stays available (V2)', async () => {
  vi.mocked(importReviewAudio).mockRejectedValueOnce(new Error('quota'));
  const harness = renderHookHarness({ guard: () => true });
  act(() => harness.latest.open());
  await expect(
    act(async () =>
      harness.latest.save(new File(['a'], 'a.webm'), trim, new AbortController().signal)
    )
  ).rejects.toThrow('quota');
  expect(harness.audio.addImported).not.toHaveBeenCalled();
});

it('does not attach the clip when the import finished after abort (V3)', async () => {
  let release!: () => void;
  vi.mocked(importReviewAudio).mockImplementationOnce(
    (args) =>
      new Promise<void>((resolve, reject) => {
        release = () => {
          try {
            args.signal.throwIfAborted();
            args.attach('project-asset:9', 2).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
        };
      })
  );
  const harness = renderHookHarness({ guard: () => true });
  act(() => harness.latest.open());
  const controller = new AbortController();
  let pending!: Promise<void>;
  await act(async () => {
    pending = harness.latest.save(new File(['a'], 'a.webm'), trim, controller.signal);
    await Promise.resolve();
  });
  controller.abort();
  // Attach the rejection probe before resolving the import so the abort rejection
  // is never momentarily unhandled.
  const rejection = expect(pending).rejects.toThrow();
  await act(async () => {
    release();
    await Promise.resolve();
  });
  await rejection;
  expect(harness.audio.addImported).not.toHaveBeenCalled();
});
