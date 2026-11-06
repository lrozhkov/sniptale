// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { usePreviewStageRuntime } from './controller';
import { usePreviewStagePresentationTime } from './presentation';
import { usePreviewStageCanvasRender } from '../scene/render';
import type { PreviewSceneRenderJob } from '../scene/render-scheduler';
import type { PreviewStageProps } from './view-types';
import type { VideoProject } from '../../../../features/video/project/types';

const scheduler = vi.hoisted(() => ({
  enqueue: vi.fn<(job: PreviewSceneRenderJob) => () => void>(() => () => undefined),
}));
vi.mock('../scene/render-scheduler', () => ({
  createPreviewSceneRenderScheduler: () => ({ enqueue: scheduler.enqueue, dispose: vi.fn() }),
}));
const images = {};
const videoFrameState = { canRender: true, version: 0 };
let latest: ReturnType<typeof usePreviewStageRuntime>;
let root: Root;
let container: HTMLDivElement;

function Harness(props: PreviewStageProps & { direct?: boolean }) {
  const runtime = usePreviewStageRuntime(props);
  latest = runtime;
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  usePreviewStageCanvasRender({
    canvasRef,
    onCameraPresented: runtime.render.onCameraPresented,
    canRenderCursorFrame: runtime.render.canRenderCursorFrame,
    ...(props.direct
      ? {
          registerPlaybackRequest: runtime.render.registerPlaybackRequest,
          renderGenerationRef: runtime.render.renderGenerationRef,
        }
      : {}),
    stageRef: runtime.surface.stageRef,
    activeClips: runtime.surface.activeClips,
    assetUrls: props.assetUrls,
    currentTime: runtime.render.currentTime,
    effectRuntimeFeedback: runtime.render.effectRuntimeFeedback,
    imageBank: images,
    isPlaying: props.isPlaying,
    previewMode: props.previewMode,
    previewRasterSize: runtime.previewRasterSize,
    project: runtime.render.project,
    resizeVersion: 0,
    videoFrameState,
    videoRefs: runtime.media.videoRefs,
  });
  return (
    <div ref={runtime.surface.stageRef}>
      <canvas ref={canvasRef} />
      <button
        data-test="begin-gesture"
        onPointerDown={(event) => {
          const clip = runtime.surface.activeClips[0];
          if (clip) runtime.surface.beginInteraction(event, clip, 'move');
        }}
      />
    </div>
  );
}

function props(): PreviewStageProps {
  const noop = () => undefined;
  return {
    project: createProject([createVideoClip({ id: 'video', duration: 5, sourceDuration: 5 })]),
    assetUrls: {},
    currentTime: 1,
    isPlaying: false,
    grid: { enabled: false, color: '#ffffff', size: 10, magnetEnabled: false, snapEnabled: false },
    playbackRange: null,
    previewMode: 'live',
    previewPreferencesSaveFailed: false,
    previewRasterPreset: '360p',
    previewZoom: 'fit',
    placementMode: null,
    selectedClipId: null,
    selectedActionOccurrence: null,
    selectedMotionRegion: null,
    activeInsertKind: null,
    onAddActionEvent: noop,
    onAddMotionRegion: noop,
    onClearActiveInsertKind: noop,
    onClearPlacementMode: noop,
    onSelectClip: noop,
    onSelectScene: noop,
    onUpdateAnnotationClipTemplate: noop,
    onUpdateActionEventDetails: noop,
    onUpdateClipTransform: noop,
    onUpdateMotionRegion: noop,
    onAddTrack: noop,
    onAddTextOverlay: () => null,
    onAddShapeOverlay: () => null,
    onEnableCursorTrack: noop,
    onImport: { audio: noop, image: noop, video: noop },
    registerPreviewRuntime: noop,
    onSeek: noop,
    onPausePlayback: () => 1,
    onPreviewModeChange: noop,
    onPreviewPreferencesRetry: noop,
    onPreviewRasterPresetChange: noop,
    onPreviewZoomChange: noop,
    onTogglePlay: noop,
  };
}
async function render(input: PreviewStageProps) {
  await act(async () => root.render(<Harness {...input} />));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  scheduler.enqueue.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('does not enqueue another paused frame for an autosave revision after a visual edit', async () => {
  const input = props();
  await render(input);
  const changed = { ...input, project: { ...input.project, backgroundColor: '#00ff00' } };
  scheduler.enqueue.mockClear();
  await render(changed);
  expect(scheduler.enqueue).toHaveBeenCalledOnce();
  const settled = latest;
  scheduler.enqueue.mockClear();
  await render({
    ...changed,
    project: { ...changed.project, updatedAt: changed.project.updatedAt + 1 },
  });
  expect(scheduler.enqueue).not.toHaveBeenCalled();
  expect(latest.render.project).toBe(settled.render.project);
  expect(latest.previewRasterSize).toBe(settled.previewRasterSize);
  expect(latest.surface.activeClips).toBe(settled.surface.activeClips);
  expect(latest.media.videoBankClips).toBe(settled.media.videoBankClips);
});

it('continues to render visual, source, project identity and seek changes', async () => {
  let input = props();
  await render(input);
  expect(input.project.assets.length).toBeGreaterThan(0);
  const updates: Partial<PreviewStageProps>[] = [
    { project: { ...input.project, backgroundColor: '#00ff00' } },
    {
      project: {
        ...input.project,
        assets: input.project.assets.map((asset) => ({
          ...asset,
          source: { kind: 'recording' as const, recordingId: 'changed' },
        })),
      },
    },
    { project: { ...input.project, id: 'replacement-project' } },
    { assetUrls: { 'asset-video': 'blob:replacement' } },
    { currentTime: 2 },
  ];
  for (const update of updates) {
    input = { ...input, ...update };
    scheduler.enqueue.mockClear();
    await render(input);
    expect(scheduler.enqueue).toHaveBeenCalledOnce();
    expect(scheduler.enqueue.mock.lastCall![0].project.id).toBe(input.project.id);
    expect(scheduler.enqueue.mock.lastCall![0].currentTime).toBe(input.currentTime);
    expect(scheduler.enqueue.mock.lastCall![0].project.assets).toBe(input.project.assets);
  }
});

it('invalidates when an optional render property is removed', async () => {
  const input = props();
  const withoutWatermark: VideoProject = { ...input.project, watermarkEnabled: false };
  await render({ ...input, project: withoutWatermark });
  scheduler.enqueue.mockClear();
  await render(input);
  expect(scheduler.enqueue).toHaveBeenCalledOnce();
});

it('does not prepare the composition camera while rendering inspector project changes', async () => {
  const composition = await import('../../../../features/video/composition/timeline/frame');
  const spy = vi.spyOn(composition, 'resolveVideoCompositionFrame');
  const input = props();
  await render(input);
  await render({ ...input, project: { ...input.project, backgroundColor: '#123456' } });
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

it('uses the accepted scene camera for overlays without enqueueing another frame', async () => {
  await render(props());
  const job = scheduler.enqueue.mock.lastCall![0];
  const camera = {
    viewportX: 30,
    viewportY: 20,
    viewportWidth: 100,
    viewportHeight: 80,
    focusPoint: { x: 80, y: 60 },
    scale: 2,
    regionId: 'accepted',
    motionBlurAmount: 0,
  };
  scheduler.enqueue.mockClear();
  act(() => job.onCameraPresented?.(camera, job.currentTime));
  expect(latest.surface.camera).toBe(camera);
  expect(scheduler.enqueue).not.toHaveBeenCalled();
});

it('blocks a paused seek gesture until the same project and destination time are presented', async () => {
  const surface = await import('./surface-state');
  const begin = vi.fn();
  const factory = vi.spyOn(surface, 'createPreviewStageInteraction').mockReturnValue(begin);
  const input = props();
  try {
    await render(input);
    const first = scheduler.enqueue.mock.lastCall![0];
    const camera = { ...latest.surface.camera, viewportX: 30 };
    act(() => first.onCameraPresented?.(camera, first.currentTime));
    await render({ ...input, currentTime: 2 });
    const destination = scheduler.enqueue.mock.lastCall![0];
    act(() =>
      container
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    );
    expect(begin).not.toHaveBeenCalled();
    act(() => first.onCameraPresented?.(camera, first.currentTime));
    act(() =>
      container
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    );
    expect(begin).not.toHaveBeenCalled();
    act(() => destination.onCameraPresented?.(camera, destination.currentTime));
    act(() =>
      container
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    );
    expect(begin).toHaveBeenCalledOnce();
  } finally {
    factory.mockRestore();
  }
});

it('loads destination clips while a paused camera receipt is pending', async () => {
  const input = props();
  input.project = createProject([
    createVideoClip({ id: 'origin', startTime: 0, duration: 1, sourceDuration: 1 }),
    createVideoClip({ id: 'destination', startTime: 2, duration: 2, sourceDuration: 2 }),
  ]);
  input.currentTime = 0.5;
  await render(input);
  const first = scheduler.enqueue.mock.lastCall![0];
  act(() => first.onCameraPresented?.(latest.surface.camera, first.currentTime));
  await render({ ...input, currentTime: 2.5 });
  expect(latest.surface.cameraInteractionEnabled).toBe(false);
  expect(latest.surface.activeClips.map((clip) => clip.id)).toEqual(['destination']);
  expect(latest.media.videoBankClips.map((clip) => clip.id)).toContain('destination');
  expect(scheduler.enqueue.mock.lastCall![0].currentTime).toBe(2.5);
});

it('keeps playback handoff and its active frozen gesture usable while rendering catches up', async () => {
  const surface = await import('./surface-state');
  const begin = vi.fn();
  const factory = vi
    .spyOn(surface, 'createPreviewStageInteraction')
    .mockImplementation((options) => (event, clip, mode) => {
      begin(event, clip, mode);
      options.gestureHooks?.onActivate?.(clip.id);
      options.gestureHooks?.onCacheBypassChange?.(true);
      options.gestureHooks?.onPreviewTransform?.(clip.id, { ...clip.transform, x: 30 });
    });
  const input = props();
  input.onPausePlayback = vi.fn(() => 2);
  try {
    await render(input);
    const first = scheduler.enqueue.mock.lastCall![0];
    act(() => first.onCameraPresented?.(latest.surface.camera, first.currentTime));
    await render({ ...input, isPlaying: true, currentTime: 2 });
    expect(latest.surface.cameraInteractionEnabled).toBe(true);
    act(() =>
      container
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    );
    expect(begin).toHaveBeenCalledOnce();
    expect(input.onPausePlayback).toHaveBeenCalledOnce();
    await render({ ...input, isPlaying: false, currentTime: 2 });
    expect(latest.cache.bypass).toBe(true);
    expect(latest.surface.cameraInteractionEnabled).toBe(true);
    const hooks = factory.mock.lastCall![0].gestureHooks!;
    act(() => {
      hooks.onRestore?.('video');
      hooks.onSettle?.('cancel');
      hooks.onCacheBypassChange?.(false);
    });
    expect(latest.cache.bypass).toBe(false);
    expect(latest.surface.cameraInteractionEnabled).toBe(false);
    const completed = scheduler.enqueue.mock.lastCall![0];
    act(() => completed.onCameraPresented?.(latest.surface.camera, completed.currentTime));
    expect(latest.surface.cameraInteractionEnabled).toBe(true);
  } finally {
    factory.mockRestore();
  }
});

it('borrows playback requests without a React time commit and restores the unregistered clock path', async () => {
  let presentation: ReturnType<typeof usePreviewStagePresentationTime>;
  let renders = 0;
  function PresentationHarness({ time = 0 }: { time?: number }) {
    renders++;
    presentation = usePreviewStagePresentationTime({
      currentTime: time,
      isPlaying: true,
      projectId: 'p',
    });
    return null;
  }
  await act(async () => {
    root.render(<PresentationHarness />);
  });
  const first = vi.fn();
  const second = vi.fn();
  const releaseFirst = presentation!.registerPlaybackRequest(first);
  const before = renders;
  act(() => presentation!.present(1));
  expect(first).toHaveBeenCalledExactlyOnceWith(1);
  expect(renders).toBe(before);
  const releaseSecond = presentation!.registerPlaybackRequest(second);
  releaseFirst();
  act(() => presentation!.present(2));
  expect(second).toHaveBeenCalledExactlyOnceWith(2);
  await act(async () => {
    root.render(<PresentationHarness time={2} />);
  });
  expect(presentation!.currentTime).toBe(2);
  releaseSecond();
  act(() => presentation!.present(3));
  expect(presentation!.currentTime).toBe(3);
});

it('routes the actual playback runtime directly to the existing scene scheduler', async () => {
  const input = { ...props(), project: createProject([]), isPlaying: true };
  const holder: { runtime: Parameters<PreviewStageProps['registerPreviewRuntime']>[0] } = {
    runtime: null,
  };
  input.registerPreviewRuntime = (runtime) => {
    holder.runtime = runtime;
  };
  await act(async () => {
    root.render(<Harness {...input} direct />);
  });
  expect(holder.runtime).not.toBeNull();
  scheduler.enqueue.mockClear();
  act(() => holder.runtime?.present(1.5));
  expect(scheduler.enqueue).toHaveBeenCalledOnce();
  expect(scheduler.enqueue.mock.lastCall![0].currentTime).toBe(1.5);
  expect(latest.render.currentTime).toBe(input.currentTime);
  await act(async () => {
    root.render(<Harness {...input} currentTime={1.5} direct />);
  });
  expect(scheduler.enqueue).toHaveBeenCalledOnce();
});
