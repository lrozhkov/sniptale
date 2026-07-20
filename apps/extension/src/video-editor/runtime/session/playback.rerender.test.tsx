// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../contracts/selection';

async function importPlaybackHook() {
  return (await import('./playback')).useVideoEditorPlayback;
}

interface PlaybackHarnessProps {
  currentTime: number;
  onController?: (controller: ReturnType<PlaybackHarnessProps['useVideoEditorPlayback']>) => void;
  project: ReturnType<typeof createEmptyVideoProject> | null;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  splitClipAt: (clipId: string, time: number) => void;
  useVideoEditorPlayback: (typeof import('./playback'))['useVideoEditorPlayback'];
}

function PlaybackHarness(props: PlaybackHarnessProps) {
  const controller = props.useVideoEditorPlayback(
    props.project,
    {
      currentTime: props.currentTime,
      isPlaying: true,
      playbackRange: null,
      selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' } as never,
      placementMode: null,
      selectedClipId: 'clip-1',
      selectedActionEvent: null,
      selectedMotionRegion: null,
    },
    {
      setCurrentTime: props.setCurrentTime,
      setPlaying: props.setPlaying,
      splitClipAt: props.splitClipAt,
      deleteClip: vi.fn(),
      deleteActionEvent: vi.fn(),
      deleteCursorSample: vi.fn(),
      deleteMotionRegion: vi.fn(),
      deleteObjectTrack: vi.fn(),
      clearPlacementMode: vi.fn(),
      updateClipTransform: vi.fn(),
      updateActionEventDetails: vi.fn(),
      updateMotionRegion: vi.fn(),
    }
  );
  props.onController?.(controller);
  return null;
}

function renderPlaybackHarness(root: Root | null, props: PlaybackHarnessProps) {
  act(() => {
    root?.render(<PlaybackHarness {...props} />);
  });
}

function createPlaybackRerenderProps(
  currentTime: number,
  project: ReturnType<typeof createEmptyVideoProject> | null,
  setCurrentTime: PlaybackHarnessProps['setCurrentTime'],
  setPlaying: PlaybackHarnessProps['setPlaying'],
  splitClipAt: PlaybackHarnessProps['splitClipAt'],
  useVideoEditorPlayback: PlaybackHarnessProps['useVideoEditorPlayback']
): PlaybackHarnessProps {
  return {
    currentTime,
    project,
    setCurrentTime,
    setPlaying,
    splitClipAt,
    useVideoEditorPlayback,
  };
}

function createRerenderProject() {
  const project = createEmptyVideoProject('Playback rerender');
  project.duration = 2;
  project.clips = [
    {
      assetId: 'asset-1',
      duration: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      fitMode: 'CONTAIN',
      groupId: null,
      id: 'clip-1',
      linkMode: 'DETACHED',
      muted: false,
      name: 'Clip 1',
      sourceDuration: 1,
      sourceStart: 0,
      startTime: 0,
      trackId: project.tracks[0]!.id,
      transitionIn: 'NONE',
      transitionOut: 'NONE',
      type: 'VIDEO',
      volume: 1,
      transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    },
  ] as never;
  return project;
}

function renderPlaybackRerenders(options: {
  project: ReturnType<typeof createRerenderProject>;
  setCurrentTime: PlaybackHarnessProps['setCurrentTime'];
  setPlaying: PlaybackHarnessProps['setPlaying'];
  splitClipAt: PlaybackHarnessProps['splitClipAt'];
  useVideoEditorPlayback: PlaybackHarnessProps['useVideoEditorPlayback'];
}) {
  renderPlaybackHarness(
    root,
    createPlaybackRerenderProps(
      0.1,
      options.project,
      options.setCurrentTime,
      options.setPlaying,
      options.splitClipAt,
      options.useVideoEditorPlayback
    )
  );
  renderPlaybackHarness(
    root,
    createPlaybackRerenderProps(
      0.75,
      options.project,
      options.setCurrentTime,
      options.setPlaying,
      options.splitClipAt,
      options.useVideoEditorPlayback
    )
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let frameCallback: FrameRequestCallback | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  frameCallback = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frameCallback = callback;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the playback loop stable across current-time rerenders and uses latest shortcut state', async () => {
  const useVideoEditorPlayback = await importPlaybackHook();
  const project = createRerenderProject();
  const setCurrentTime = vi.fn<(time: number) => void>();
  const setPlaying = vi.fn<(playing: boolean) => void>();
  const splitClipAt = vi.fn<(clipId: string, time: number) => void>();

  renderPlaybackRerenders({
    project,
    setCurrentTime,
    setPlaying,
    splitClipAt,
    useVideoEditorPlayback,
  });

  act(() => {
    frameCallback?.(1100);
  });

  expect(setCurrentTime).toHaveBeenLastCalledWith(0.2);

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
  });

  expect(splitClipAt).toHaveBeenCalledWith('clip-1', 0.75);
});

it('presents project-FPS frames independently of the 30 Hz UI projection and settles exact pause time', async () => {
  const useVideoEditorPlayback = await importPlaybackHook();
  const project = { ...createRerenderProject(), fps: 60 };
  const setCurrentTime = vi.fn<(time: number) => void>();
  const setPlaying = vi.fn<(playing: boolean) => void>();
  let controller: ReturnType<typeof useVideoEditorPlayback> | null = null;
  renderPlaybackHarness(root, {
    ...createPlaybackRerenderProps(
      0,
      project,
      setCurrentTime,
      setPlaying,
      vi.fn(),
      useVideoEditorPlayback
    ),
    onController: (value) => (controller = value),
  });
  const runtime = {
    cancel: vi.fn(),
    prepare: vi.fn(),
    present: vi.fn(),
    settle: vi.fn(),
    subscribe: vi.fn(),
  };
  controller!.registerPreviewRuntime(runtime);

  act(() => frameCallback?.(1017));
  act(() => frameCallback?.(1034));

  expect(runtime.present.mock.calls.map(([time]) => time)).toEqual([1 / 60, 2 / 60]);
  expect(setCurrentTime).toHaveBeenCalledOnce();
  vi.mocked(performance.now).mockReturnValue(1042);
  let settledTime = 0;
  act(() => {
    settledTime = controller!.pausePlayback();
  });
  expect(settledTime).toBe(3 / 60);
  expect(runtime.settle).toHaveBeenCalledWith(3 / 60);
  expect(setCurrentTime).toHaveBeenLastCalledWith(3 / 60);
  expect(setPlaying).toHaveBeenCalledWith(false);
});

it('cancels the registered preview preparation when its project is cleared', async () => {
  const useVideoEditorPlayback = await importPlaybackHook();
  const props = createPlaybackRerenderProps(
    0,
    createRerenderProject(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    useVideoEditorPlayback
  );
  let controller: ReturnType<typeof useVideoEditorPlayback> | null = null;
  renderPlaybackHarness(root, { ...props, onController: (value) => (controller = value) });
  const runtime = {
    cancel: vi.fn(),
    prepare: vi.fn(),
    present: vi.fn(),
    settle: vi.fn(),
    subscribe: vi.fn(),
  };
  controller!.registerPreviewRuntime(runtime);

  renderPlaybackHarness(root, {
    ...props,
    onController: (value) => (controller = value),
    project: null,
  });

  expect(runtime.cancel).toHaveBeenCalledOnce();
});
