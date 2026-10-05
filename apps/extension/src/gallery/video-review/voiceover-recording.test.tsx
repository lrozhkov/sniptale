// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import { useReviewEditorAudio, useReviewVoiceoverRecording } from './voiceover-recording';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewVoiceover } from '../../features/video/review/voiceover-edits';
import type { ReviewEdit } from '../../features/video/review/types';
import { importReviewAudio } from '../../workflows/video-review/audio-import';
import type { AudioTrimRange } from '../../composition/audio-recording/session-types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../workflows/video-review/audio-import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/audio-import')>()),
  importReviewAudio: vi.fn(
    async (args: {
      signal: AbortSignal;
      assertCurrentTarget(): void;
      attach(assetId: string, duration: number): Promise<void>;
      onPrepared?(prepared: {
        assetId: string;
        duration: number;
        protect(): Promise<void>;
        cancel(): Promise<void>;
        publish(): Promise<void>;
        discard(): Promise<void>;
      }): void;
    }) => {
      args.signal.throwIfAborted();
      args.assertCurrentTarget();
      args.onPrepared?.({
        assetId: 'project-asset:7',
        duration: 2,
        protect: async () => undefined,
        cancel: async () => undefined,
        publish: async () => undefined,
        discard: async () => undefined,
      });
      await args.attach('project-asset:7', 2);
    }
  ),
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

type RecordingApi = ReturnType<typeof useReviewVoiceoverRecording>;

function createRecordingSession() {
  let content = { audio: { voiceover: [] as { id: string; assetId: string }[] } };
  const session = {
    getSnapshot: () => ({
      snapshot: { workspace: { aggregateId: 'review-1' } },
      document: { advancedContent: content },
    }),
    commit: vi.fn(async (operation: { after: typeof content }) => {
      content = operation.after;
    }),
    commitDurable: vi.fn(async (operation: { after: typeof content }) => {
      content = operation.after;
    }),
  } as unknown as Parameters<typeof useReviewVoiceoverRecording>[0]['session'];
  return session;
}

function renderHookHarness(props: {
  guard: () => boolean;
  time?: { current: number };
  duration?: number;
  edits?: ReviewEdit[];
  flushAdvanced?: () => Promise<void>;
}) {
  let latest!: RecordingApi;
  const node = {
    currentTime: 0,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
  const video = { current: node } as RefObject<HTMLVideoElement | null>;
  const audio = { addImported: vi.fn(), markImported: vi.fn() } as unknown as Parameters<
    typeof useReviewVoiceoverRecording
  >[0]['audio'];
  const session = createRecordingSession();
  const Harness = () => {
    latest = useReviewVoiceoverRecording({
      video,
      time: props.time?.current ?? 3,
      segments: buildReviewTimeMap(props.duration ?? 10, props.edits ?? []),
      audio,
      session,
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
    session,
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
  act(() => harness.latest.open());
  await act(async () => harness.latest.syncStart());
  expect(harness.node.currentTime).toBe(3);
  expect(harness.node.play).toHaveBeenCalledOnce();
  act(() => harness.latest.syncStop());
  expect(harness.node.pause).toHaveBeenCalledTimes(2);
});

it('keeps video paused while recording without video playback', async () => {
  const harness = renderHookHarness({ guard: () => true });
  act(() => harness.latest.open());
  await act(async () => harness.latest.syncStart(false));
  expect(harness.node.currentTime).toBe(3);
  expect(harness.node.play).not.toHaveBeenCalled();
  await act(async () => harness.latest.syncResume(false));
  expect(harness.node.play).not.toHaveBeenCalled();
});

it('rejects sync start when the source playback fails', async () => {
  const failing = {
    currentTime: 0,
    play: vi.fn(async () => Promise.reject(new Error('no'))),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
  let latest!: RecordingApi;
  const audio = { addImported: vi.fn(), markImported: vi.fn() } as unknown as Parameters<
    typeof useReviewVoiceoverRecording
  >[0]['audio'];
  const session = createRecordingSession();
  let video: RefObject<HTMLVideoElement | null> = {
    current: failing,
  } as RefObject<HTMLVideoElement | null>;
  const Harness = () => {
    latest = useReviewVoiceoverRecording({
      video,
      time: 1,
      segments: buildReviewTimeMap(4, []),
      audio,
      session,
      guard: () => true,
      flushAdvanced: async () => undefined,
    });
    return null;
  };
  act(() => root.render(<Harness />));
  act(() => latest.open());
  await expect(act(async () => latest.syncStart())).rejects.toThrow('no');
  video = { current: null } as RefObject<HTMLVideoElement | null>;
  act(() => root.render(<Harness />));
  await act(async () => latest.syncStart());
  expect(latest.recording).toBe(true);
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
  expect(harness.audio.markImported).toHaveBeenCalledWith(
    expect.objectContaining({
      assetId: 'project-asset:7',
      duration: 2,
      timelineStart: 4,
      sourceAnchor: [{ start: 4, end: 6, offset: 0, duration: 2 }],
    }),
    2,
    'a.webm'
  );
  expect(flushAdvanced).toHaveBeenCalledOnce();
});

it('keeps source placement when a preceding cut shortens the output', async () => {
  const harness = renderHookHarness({
    guard: () => true,
    edits: [{ id: 'cut', kind: 'cut', start: 0, end: 2, requestedStart: 0, requestedEnd: 2 }],
  });
  act(() => harness.latest.open());
  await act(async () =>
    harness.latest.save(
      new File(['a'], 'a.webm'),
      { trimStart: 1, trimEnd: 3 },
      new AbortController().signal
    )
  );
  expect(harness.audio.markImported).toHaveBeenCalledWith(
    expect.objectContaining({ timelineStart: 4, duration: 2 }),
    2,
    'a.webm'
  );
});

it('keeps the entry anchor for retry and places trimmed audio in output time across speed edits', async () => {
  const time = { current: 3 };
  const harness = renderHookHarness({
    guard: () => true,
    time,
    duration: 12,
    edits: [
      {
        id: 'speed',
        kind: 'speed',
        start: 1,
        end: 11,
        requestedStart: 1,
        requestedEnd: 11,
        rate: 2,
        audio: 'speed',
      },
    ],
  });
  act(() => harness.latest.open());
  time.current = 5;
  act(() => root.render(<harness.Harness />));
  await act(async () => harness.latest.syncStart());
  expect(harness.node.currentTime).toBe(3);
  await act(async () =>
    harness.latest.save(
      new File(['a'], 'a.webm'),
      { trimStart: 1, trimEnd: 3 },
      new AbortController().signal
    )
  );
  expect(harness.audio.markImported).toHaveBeenCalledWith(
    expect.objectContaining({
      timelineStart: 5,
      sourceAnchor: [{ start: 5, end: 9, offset: 0, duration: 2 }],
    }),
    2,
    'a.webm'
  );
});

it('opens and saves a take inside a cut instead of refusing placement', async () => {
  const harness = renderHookHarness({
    guard: () => true,
    edits: [{ id: 'cut', kind: 'cut', start: 2, end: 8, requestedStart: 2, requestedEnd: 8 }],
  });
  act(() => harness.latest.open());
  expect(harness.latest.recording).toBe(true);
  await act(async () =>
    harness.latest.save(
      new File(['a'], 'a.webm'),
      { trimStart: 1, trimEnd: 3 },
      new AbortController().signal
    )
  );
  const clip = harness.session.getSnapshot().document.advancedContent.audio.voiceover[0]!;
  expect(clip).toMatchObject({
    timelineStart: 4,
    duration: 2,
    sourceAnchor: [{ start: 4, end: 6, offset: 0, duration: 2 }],
  });
  expect(
    projectReviewVoiceover(
      [clip],
      buildReviewTimeMap(10, [
        { id: 'cut', kind: 'cut', start: 2, end: 8, requestedStart: 2, requestedEnd: 8 },
      ])
    )
  ).toEqual([]);
  expect(projectReviewVoiceover([clip], buildReviewTimeMap(10, []))).toMatchObject([
    { timelineStart: 4, duration: 2 },
  ]);
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

it('retries an already committed take without attaching a second clip', async () => {
  const publish = vi.fn(async () => undefined);
  vi.mocked(importReviewAudio).mockImplementationOnce(async (args) => {
    args.onPrepared?.({
      assetId: 'project-asset:7',
      duration: 2,
      protect: async () => undefined,
      cancel: async () => undefined,
      publish,
      discard: async () => undefined,
    });
    await args.attach('project-asset:7', 2);
    throw new Error('publication pending');
  });
  const harness = renderHookHarness({ guard: () => true });
  const take = new Blob(['voice']);
  const importsBefore = vi.mocked(importReviewAudio).mock.calls.length;
  act(() => harness.latest.open());
  await expect(
    act(async () =>
      harness.latest.save(
        new File(['voice'], 'voice.webm'),
        trim,
        new AbortController().signal,
        take
      )
    )
  ).rejects.toThrow('publication pending');
  await act(async () =>
    harness.latest.save(new File(['voice'], 'voice.webm'), trim, new AbortController().signal, take)
  );
  expect(importReviewAudio).toHaveBeenCalledTimes(importsBefore + 1);
  expect(publish).toHaveBeenCalledOnce();
  expect(harness.audio.markImported).toHaveBeenCalledOnce();
});

it('durably commits a recording even when review autosave is disabled', async () => {
  const harness = renderHookHarness({ guard: () => true });
  act(() => harness.latest.open());
  await act(async () =>
    harness.latest.save(new File(['voice'], 'voice.webm'), trim, new AbortController().signal)
  );
  expect(harness.session.commitDurable).toHaveBeenCalledOnce();
  expect(harness.session.commit).not.toHaveBeenCalled();
});

it('does not finish a committed take when publication cannot be resumed', async () => {
  vi.mocked(importReviewAudio).mockImplementationOnce(async (args) => {
    await args.attach('project-asset:7', 2);
    throw new Error('publication journal failed');
  });
  const harness = renderHookHarness({ guard: () => true });
  const take = new Blob(['voice']);
  act(() => harness.latest.open());
  await expect(
    act(async () =>
      harness.latest.save(
        new File(['voice'], 'voice.webm'),
        trim,
        new AbortController().signal,
        take
      )
    )
  ).rejects.toThrow('publication journal failed');
  await expect(
    act(async () =>
      harness.latest.save(
        new File(['voice'], 'voice.webm'),
        trim,
        new AbortController().signal,
        take
      )
    )
  ).rejects.toThrow('publication');
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

it('rejects an old review attachment after the voiceover panel closes', async () => {
  let finish!: () => void;
  vi.mocked(importReviewAudio).mockImplementationOnce(async (args) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    args.assertCurrentTarget();
    await args.attach('project-asset:9', 2);
  });
  const harness = renderHookHarness({ guard: () => true });
  act(() => harness.latest.open());
  const pending = harness.latest.save(
    new File(['voice'], 'voice.webm'),
    trim,
    new AbortController().signal
  );
  const rejected = expect(pending).rejects.toThrow('Recording review changed');
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  act(() => harness.latest.close());
  await act(async () => finish());
  await rejected;
  expect(harness.audio.markImported).not.toHaveBeenCalled();
});

it('issues retention after durable attach even if the subsequent publication fails', async () => {
  const harness = renderHookHarness({ guard: () => true });
  act(() => harness.latest.open());
  vi.mocked(importReviewAudio).mockImplementationOnce(async (args) => {
    await args.attach('project-asset:7', 2);
    throw new Error('publication failed');
  });
  const retained = vi.fn();
  await expect(
    harness.latest.save(
      new File(['voice'], 'voice.webm'),
      trim,
      new AbortController().signal,
      new Blob(['voice']),
      retained
    )
  ).rejects.toThrow('publication failed');
  expect(retained).toHaveBeenCalledOnce();
  expect(harness.session.commitDurable).toHaveBeenCalledOnce();
});

it.each(['positive', 'negative', 'unavailable'] as const)(
  'uses a confirmed durable read before recovery reload for retention: %s',
  async (result) => {
    const harness = renderHookHarness({ guard: () => true });
    act(() => harness.latest.open());
    vi.mocked(harness.session.commitDurable).mockRejectedValueOnce(
      new Error('write result uncertain')
    );
    harness.session.hasDurableVoiceoverClip =
      result === 'unavailable'
        ? vi.fn(async () => {
            throw new Error('read failed');
          })
        : vi.fn(async () => result === 'positive');
    harness.session.reload = vi.fn(async () => {
      throw new Error('reload failed');
    });
    const retained = vi.fn();
    await expect(
      harness.latest.save(
        new File(['voice'], 'voice.webm'),
        trim,
        new AbortController().signal,
        new Blob(['voice']),
        retained
      )
    ).rejects.toThrow();
    expect(retained).toHaveBeenCalledTimes(result === 'positive' ? 1 : 0);
    expect(harness.session.reload).toHaveBeenCalledTimes(result === 'positive' ? 1 : 0);
  }
);

it.each([9, 10])(
  'retains a complete take at source %s including trim beyond the video end',
  async (start) => {
    const harness = renderHookHarness({ guard: () => true, time: { current: start } });
    act(() => harness.latest.open());
    expect(harness.latest.recording).toBe(true);
    await act(async () =>
      harness.latest.save(
        new File(['voice'], 'voice.webm'),
        { trimStart: 2, trimEnd: 4 },
        new AbortController().signal
      )
    );
    const clip = harness.session.getSnapshot().document.advancedContent.audio.voiceover[0]!;
    expect(clip).toMatchObject({ timelineStart: start + 2, duration: 2 });
    expect(projectReviewVoiceover([clip], buildReviewTimeMap(10, []))).toEqual([]);
  }
);

it.each([undefined, 4])('imports voiceover at a cut source position (drop=%s)', async (drop) => {
  const session = createRecordingSession();
  const audio = { addImported: vi.fn(), markImported: vi.fn() } as unknown as Parameters<
    typeof useReviewEditorAudio
  >[0]['audio'];
  const segments = buildReviewTimeMap(10, [
    { id: 'cut', kind: 'cut', start: 2, end: 6, requestedStart: 2, requestedEnd: 6 },
  ]);
  let pending: Promise<unknown> = Promise.resolve();
  let api!: ReturnType<typeof useReviewEditorAudio>;
  const rejected = vi.fn();
  function Harness() {
    api = useReviewEditorAudio({
      busy: false,
      canStart: () => true,
      time: 3,
      resultDuration: 6,
      segments,
      toOutputTime: () => null,
      onCutPlacement: rejected,
      video: { current: null },
      run: (action) => {
        pending = action();
        return pending;
      },
      flushAdvanced: async () => {},
      audio,
      session,
    });
    return null;
  }
  act(() => root.render(<Harness />));
  await act(async () => {
    api.onImportAudioFile(new File(['voice'], 'voice.wav'), 'voiceover', drop);
    await pending;
  });
  expect(rejected).not.toHaveBeenCalled();
  expect(audio.addImported).toHaveBeenCalledWith(
    expect.objectContaining({
      timelineStart: drop ?? 3,
      duration: 2,
      sourceAnchor: [{ start: drop ?? 3, end: (drop ?? 3) + 2, offset: 0, duration: 2 }],
    }),
    'voiceover',
    2,
    'voice.wav'
  );
});

it('does not restart video from zero when recording or resuming at its endpoint', async () => {
  const harness = renderHookHarness({ guard: () => true, time: { current: 10 } });
  Object.defineProperty(harness.node, 'duration', { value: 10 });
  act(() => harness.latest.open());
  await act(async () => harness.latest.syncStart(true));
  await act(async () => harness.latest.syncResume(true));
  expect(harness.node.currentTime).toBe(10);
  expect(harness.node.play).not.toHaveBeenCalled();
  expect(harness.latest.recording).toBe(true);
});
