// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import { useReviewVoiceoverRecording } from './voiceover-recording';
import { ReviewVoiceoverRecording } from './voiceover-panel';
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

it('shows a bottom strip with an optional visible duration cap', () => {
  renderRecording(true);
  const modal = host.querySelector('[role="dialog"]');
  expect(modal).not.toBeNull();
  expect(host.querySelector('[data-ui="gallery.videoReview.voiceoverStrip"]')).not.toBeNull();
  expect(modal!.textContent).toContain('gallery.videoReview.recordVoiceover');
  expect(modal!.textContent).toContain('videoEditor.app.recordAudioStart');
  expect(modal!.textContent).toContain('gallery.videoReview.voiceoverDurationLimit');
  const limit = modal!.querySelector<HTMLButtonElement>(
    '[data-ui="audio-recording.duration-limit"]'
  )!;
  expect(limit.getAttribute('role')).toBe('switch');
  expect(limit.getAttribute('aria-checked')).toBe('true');
  const duration = modal!.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(duration.value).toBe('7');
  expect(duration.max).toBe('7');
  act(() => limit.click());
  expect(limit.getAttribute('aria-checked')).toBe('false');
  expect(modal!.querySelector('input[type="number"]')).toBeNull();
  expect(modal!.textContent).toContain('00:07');
});

it('offers a visible video playback choice before capture and keeps the placement visible', () => {
  renderRecording(true);
  const playback = host.querySelector<HTMLButtonElement>('[data-ui="audio-recording.play-video"]');
  expect(playback?.getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).toContain('00:03');
  act(() => playback?.click());
  expect(playback?.getAttribute('aria-checked')).toBe('false');
});

it('stays closed when isOpen is false', () => {
  renderRecording(false);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it('shows recording, pause, resume and take review with the same lower panel', async () => {
  class Recorder extends EventTarget {
    static isTypeSupported = () => true;
    state = 'inactive';
    mimeType = 'audio/webm';
    start() {
      this.state = 'recording';
    }
    pause() {
      this.state = 'paused';
    }
    resume() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      const data = new Event('dataavailable');
      Object.defineProperty(data, 'data', { value: new Blob(['voice']) });
      this.dispatchEvent(data);
      this.dispatchEvent(new Event('stop'));
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }] }),
      enumerateDevices: async () => [],
    },
  });
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:voice', revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  renderRecording(true);
  const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  const setNumber = (node: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
  setNumber(input, '5');
  const click = async (label: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes(label)
    )!;
    await act(async () => button.click());
  };
  await click('videoEditor.app.recordAudioStart');
  expect(host.textContent).toContain('videoEditor.app.recordAudioPause');
  await click('videoEditor.app.recordAudioPause');
  expect(host.textContent).toContain('videoEditor.app.recordAudioResume');
  await click('videoEditor.app.recordAudioResume');
  await click('videoEditor.app.recordAudioStop');
  expect(host.textContent).toContain('videoEditor.app.recordAudioSave');
  expect(host.textContent).toContain('videoEditor.app.recordAudioAgain');
  act(() =>
    root.render(
      <ReviewVoiceoverRecording
        isOpen
        playhead={3}
        timelineDuration={4}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onSyncStart={vi.fn(async () => undefined)}
        onSyncStop={vi.fn()}
      />
    )
  );
  const again = [...host.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('recordAudioAgain')
  )!;
  expect(again.disabled).toBe(true);
  const repair = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(repair.value).toBe('5');
  expect(repair.max).toBe('1');
  setNumber(repair, '0.5');
  expect(again.disabled).toBe(false);
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
  resultDuration?: number;
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
  const audio = { addImported: vi.fn(), markImported: vi.fn() } as unknown as Parameters<
    typeof useReviewVoiceoverRecording
  >[0]['audio'];
  const session = createRecordingSession();
  const Harness = () => {
    latest = useReviewVoiceoverRecording({
      video,
      time: props.time?.current ?? 3,
      resultDuration: props.resultDuration ?? 10,
      toOutputTime: props.toOutputTime ?? ((source: number) => source),
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
      resultDuration: 4,
      toOutputTime: (source: number) => source,
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
      atTime: 4,
      timelineDuration: 10,
    }),
    2,
    'a.webm'
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
  expect(harness.audio.markImported).toHaveBeenCalledWith(
    expect.objectContaining({ atTime: 2, timelineDuration: 10 }),
    2,
    'a.webm'
  );
});

it('keeps the entry anchor for retry and places trimmed audio in output time across speed edits', async () => {
  const time = { current: 3 };
  const harness = renderHookHarness({
    guard: () => true,
    time,
    resultDuration: 6,
    toOutputTime: (source) => (source - 1) / 2,
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
    expect.objectContaining({ atTime: 2, timelineDuration: 6 }),
    2,
    'a.webm'
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
