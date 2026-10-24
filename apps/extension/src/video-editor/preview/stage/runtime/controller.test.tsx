// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { usePreviewStageRuntime } from './controller';
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

function Harness(props: PreviewStageProps) {
  const runtime = usePreviewStageRuntime(props);
  latest = runtime;
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  usePreviewStageCanvasRender({
    canvasRef,
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
