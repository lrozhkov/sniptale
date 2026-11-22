// @vitest-environment jsdom
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import * as recordingAudio from '../../workflows/video-review/recording-action-audio';
import eventsFixture from '../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../features/video/project/recording-events/records';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { useReviewEditorAudioRuntime } from './use-review-audio-runtime';
import { useReviewTransport } from './use-review-transport';
import type { ReviewTransportAudioClock } from './transport';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { workspace } from '../../composition/persistence/review-workspaces/backup-restore.test-support';

const bridge = vi.hoisted(() => ({
  video: { current: null as HTMLVideoElement | null },
  options: undefined as Parameters<typeof useReviewEditorAudioRuntime>[0] | undefined,
  play: vi.fn(),
  pause: vi.fn(),
  preparePlayback: vi.fn(async () => true),
  startPlayback: vi.fn(),
  stopPlayback: vi.fn(),
  readAudioClock: vi.fn<() => ReviewTransportAudioClock | null>(() => null),
  audition: vi.fn(),
}));
vi.mock('./use-review-audio-runtime', () => ({
  useReviewEditorAudioRuntime(options: Parameters<typeof useReviewEditorAudioRuntime>[0]) {
    bridge.options = options;
    return bridge;
  },
}));
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
type TransportInput = Parameters<typeof useReviewTransport>[0];
function mount(
  silent = false,
  archive?: Pick<TransportInput, 'interactionTimeline' | 'interactionEnabled' | 'actionAudio'> & {
    project: NonNullable<TransportInput['resource']['historyProject']>;
  },
  edits: TransportInput['edits'] = []
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  bridge.preparePlayback.mockResolvedValue(true);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(3);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (
    this: HTMLMediaElement
  ) {
    bridge.play();
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    bridge.pause();
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  });
  const snapshot = { workspace: structuredClone(workspace), draft: null };
  if (edits.length) {
    snapshot.workspace.history = edits.map((after, index) => ({
      id: `edit-${index}`,
      at: index + 1,
      target: 'edit',
      before: null,
      after,
    }));
    snapshot.workspace.cursor = edits.length;
  }
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
        ...(archive ? { historyProject: archive.project } : {}),
      },
      edits,
      originalAudio: workspace.advanced.audio.original,
      voiceover: [],
      music: [],
      onSeek: vi.fn(),
      boundaries: () => undefined,
      onTransportFailure: failure,
      silent,
      ...(archive
        ? {
            actionsApplied: true,
            interactionTimeline: archive.interactionTimeline,
            interactionEnabled: archive.interactionEnabled,
            actionAudio: archive.actionAudio,
          }
        : {}),
    });
    return (
      <video
        ref={hook.video}
        onPlay={() => hook.onMediaPlayback(true)}
        onPause={() => hook.onMediaPlayback(false)}
      />
    );
  }
  act(() => root.render(<Probe />));
  bridge.video.current = hook.video.current;
  cleanup = async () => {
    act(() => root.unmount());
    await session.dispose();
  };
  return { get: () => hook, failure, session };
}

it('wires a graph scheduling projection separately from the output position', async () => {
  let graph = 10;
  const identity = {};
  bridge.readAudioClock.mockImplementation(() => ({
    identity,
    graphTime: graph,
    outputTime: graph - 0.05,
  }));
  try {
    const fixture = mount();
    act(() => fixture.get().seek(0.2, false));
    await act(async () => fixture.get().play());
    graph = 10.1;
    expect(fixture.get().readPosition().resultTime).toBeCloseTo(0.25, 8);
    expect(bridge.options?.transportControl?.readSchedulingPosition?.().resultTime).toBeCloseTo(
      0.3,
      8
    );
  } finally {
    bridge.readAudioClock.mockReturnValue(null);
  }
});

it('uses an accepted temporal edit before React republishes transport props', async () => {
  const fixture = mount();
  fixture.session.setAutosaveEnabled(false);
  const durableRevision = fixture.session.getSnapshot().snapshot.workspace.revision;
  await fixture.session.commit({
    id: 'insert-hold',
    at: 1,
    target: 'edit',
    before: null,
    after: {
      id: 'new-hold',
      kind: 'freeze',
      start: 1,
      end: 1,
      requestedStart: 1,
      requestedEnd: 1,
      duration: 2,
      frameTime: 0.98,
      frameDuration: 0.04,
    },
  });
  expect(fixture.session.getSnapshot().snapshot.workspace.revision).toBe(durableRevision);
  expect(fixture.get().readPosition().mapRevision).toBe(1);
  await act(async () => fixture.get().seekResult(1.5));
  expect(fixture.get().readPosition()).toMatchObject({
    resultTime: 1.5,
    source: { kind: 'freeze', sourceTime: 1, mediaTime: 0.98 },
  });
});
it('waits for audio readiness and refuses Play when preparation fails', async () => {
  const mounted = mount();
  bridge.preparePlayback.mockResolvedValueOnce(false);
  await act(async () => mounted.get().play());
  expect(bridge.play).not.toHaveBeenCalled();
  await act(async () => mounted.get().play());
  expect(bridge.preparePlayback).toHaveBeenCalledTimes(2);
  expect(bridge.play).toHaveBeenCalledOnce();
  expect(bridge.startPlayback).toHaveBeenCalledOnce();
});
it('stops scheduled audio before pausing the native video transport', async () => {
  const mounted = mount();
  await act(async () => mounted.get().play());
  bridge.preparePlayback.mockClear();
  bridge.stopPlayback.mockClear();
  bridge.pause.mockClear();
  await act(async () => mounted.get().play());
  expect(bridge.preparePlayback).not.toHaveBeenCalled();
  expect(bridge.stopPlayback).toHaveBeenCalledOnce();
  expect(bridge.stopPlayback.mock.invocationCallOrder[0]).toBeLessThan(
    bridge.pause.mock.invocationCallOrder[0]!
  );
  const pause = vi.spyOn(bridge.video.current!, 'pause').mockImplementation(() => {});
  pause.mockClear();
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

it('pauses the logical transport before an audition can pause its native element', async () => {
  const mounted = mount();
  await act(async () => mounted.get().play());
  bridge.pause.mockClear();
  bridge.stopPlayback.mockClear();
  const plan = { duration: 2, descriptors: [] };
  act(() => mounted.get().actionSoundPreview.audition(plan));
  expect(mounted.get().playing).toBe(false);
  expect(bridge.audition).toHaveBeenCalledExactlyOnceWith(plan);
  expect(bridge.stopPlayback.mock.invocationCallOrder[0]).toBeLessThan(
    bridge.audition.mock.invocationCallOrder[0]!
  );
  expect(bridge.pause.mock.invocationCallOrder[0]).toBeLessThan(
    bridge.audition.mock.invocationCallOrder[0]!
  );
});

it('passes authored timing and independent lane gates to the owned archive sound source', async () => {
  if (!isRecordingEventsDescriptor(eventsFixture.descriptor)) throw new Error('Invalid fixture');
  const source = {
    duration: workspace.source.duration,
    admit: vi.fn(async () => ({ maxVoices: 0, busGain: 1, sampleIds: [], firstCueTime: null })),
    readWindow: vi.fn(async () => ({ duration: workspace.source.duration, descriptors: [] })),
    dispose: vi.fn(),
  };
  const create = vi
    .spyOn(recordingAudio, 'createReviewRecordingActionAudioSource')
    .mockReturnValue(source);
  const interactionTimeline = {
    presses: [
      {
        id: 'authored',
        family: 'mouse' as const,
        start: 1,
        end: 1.2,
        label: 'Click',
        button: 0,
        x: 0.5,
        y: 0.5,
      },
    ],
    overrides: [],
  };
  try {
    mount(false, {
      project: createVideoProjectFromRecording({
        ...workspace.source,
        recordingId: eventsFixture.recordingId,
        filename: 'source.webm',
        recordingEvents: eventsFixture.descriptor,
      }),
      interactionTimeline,
      interactionEnabled: { keyboard: false, mouse: true },
      actionAudio: [],
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionTimeline,
        interactionEnabled: { keyboard: false, mouse: true },
      })
    );
    await cleanup?.();
    cleanup = undefined;
    expect(source.dispose).toHaveBeenCalledOnce();
  } finally {
    create.mockRestore();
  }
});

it('stops the logical project clock when audio fails while native video is already held', async () => {
  const mounted = mount(false, undefined, [
    {
      id: 'hold',
      kind: 'freeze',
      start: 1,
      end: 1,
      requestedStart: 1,
      requestedEnd: 1,
      duration: 2,
      frameTime: 0.98,
      frameDuration: 0.04,
    },
  ]);
  await act(async () => mounted.get().seekResult(1.5));
  await act(async () => mounted.get().play());
  expect(bridge.video.current!.paused).toBe(true);
  expect(mounted.get().playing).toBe(true);
  bridge.stopPlayback.mockClear();
  bridge.pause.mockClear();
  await act(async () => bridge.options!.onFailure());
  expect(bridge.stopPlayback).toHaveBeenCalledOnce();
  expect(bridge.pause).toHaveBeenCalledOnce();
  expect(mounted.get().playing).toBe(false);
  expect(mounted.get().readPosition().resultTime).toBe(1.5);
  expect(mounted.failure).toHaveBeenCalledExactlyOnceWith({ kind: 'audio' });
});

it('publishes pending audio preparation and clears it when Play is canceled', async () => {
  const fixture = mount();
  let release!: (ready: boolean) => void;
  bridge.preparePlayback.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = fixture.get().play();
  });
  try {
    expect(fixture.get()).toHaveProperty('preparingPlayback', true);
    await act(async () => fixture.get().pause());
    expect(fixture.get()).toHaveProperty('preparingPlayback', false);
    await act(async () => {
      release(true);
      await pending;
    });
    expect(bridge.play).not.toHaveBeenCalled();
  } finally {
    release(false);
    await pending;
  }
});
