// @vitest-environment jsdom
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import * as recordingAudio from '../../workflows/video-review/recording-action-audio';
import eventsFixture from '../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../features/video/project/recording-events/records';
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
  pause: vi.fn(),
  preparePlayback: vi.fn(async () => true),
  startPlayback: vi.fn(),
  stopPlayback: vi.fn(),
}));
vi.mock('./use-playback', () => ({
  useReviewPlayback(options: Parameters<typeof useReviewPlayback>[0]) {
    bridge.options = options;
    return {
      video: bridge.video,
      time: 0,
      playing: false,
      seekRevision: 0,
      play: bridge.play,
      pause: bridge.pause,
    };
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
type TransportInput = Parameters<typeof useReviewTransport>[0];
function mount(
  silent = false,
  archive?: Pick<TransportInput, 'interactionTimeline' | 'interactionEnabled' | 'actionAudio'> & {
    project: NonNullable<TransportInput['resource']['historyProject']>;
  }
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  bridge.preparePlayback.mockResolvedValue(true);
  bridge.video.current = document.createElement('video');
  bridge.pause.mockImplementation(() => bridge.video.current?.pause());
  const snapshot = { workspace: structuredClone(workspace), draft: null };
  const session = createVideoReviewSession(snapshot);
  const root = createRoot(document.createElement('div'));
  const failure = vi.fn();
  const edits: TransportInput['edits'] = [];
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
    bridge.pause.mock.invocationCallOrder[0]!
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

it('stops the logical project clock when audio fails while native video is already held', () => {
  const mounted = mount();
  const nativePause = vi.spyOn(bridge.video.current!, 'pause').mockImplementation(() => {});
  expect(bridge.video.current!.paused).toBe(true);
  bridge.options!.onFailure();
  expect(bridge.stopPlayback).toHaveBeenCalledOnce();
  expect(bridge.pause).toHaveBeenCalledOnce();
  expect(nativePause).toHaveBeenCalledOnce();
  expect(mounted.failure).toHaveBeenCalledOnce();
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
