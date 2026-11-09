import { resolveVideoCompositionRenderPasses } from '../../features/video/composition/timeline/render';
import { hasCursorFollowingCameraAt } from '../../features/video/composition/motion/camera-interval';
import { disposeEffectRuntimeComposition } from '../../features/video/composition/effect-runtime';
import type { VideoCompositionTimelineIndex } from '../../features/video/composition/timeline/frame/index';
import { resolveProjectExportRange } from '../../features/video/project/export/range';
import type { VideoProject } from '../../features/video/project/types/model';
import type { VideoProjectExportSettings } from '../../features/video/project/types/export';
import { createVideoProjectCaptionRenderer } from '../../workflows/video-review/project-captions';
import { createRecordingCursorTrajectoryRenderer } from '../../workflows/video-review/cursor-trajectory';
import { createRecordingEventsRenderer } from '../../workflows/video-review/recording-events';
import {
  renderOffscreenProjectEffectFrames,
  type OffscreenProjectEffectRuntime,
} from './effect-runtime';
import { drawProjectFrame, type LoadedImagesMap } from './renderer';
import type { ExportSceneBackgroundCache } from './renderer/background';
import { getProjectExportSpatialRenderer, getProjectExportWatermarkRenderer } from './runtime';
import type { ExportJobState } from './types';

/** Media synchronization and final joins/fades belong to the calling render path. */
export interface ProjectCompositionSceneInput {
  context: CanvasRenderingContext2D;
  currentTime: number;
  captionSampleTime?: number;
  sourceSamplingFallback?: 'first' | 'last';
  job: Pick<
    ExportJobState,
    | 'sourceSampling'
    | 'cancelled'
    | 'cameraSpatialRenderer'
    | 'captionRenderer'
    | 'watermarkRenderer'
    | 'cursorTrajectoryRenderer'
    | 'recordingEventsRenderer'
  >;
  loadedImages: LoadedImagesMap;
  clipMediaElements: Parameters<typeof drawProjectFrame>[5];
  project: VideoProject;
  settings: VideoProjectExportSettings;
  signal?: AbortSignal;
  ownerDocument?: Document;
  compositionIndex?: VideoCompositionTimelineIndex;
  effectRuntime?: OffscreenProjectEffectRuntime;
  backgroundCache?: ExportSceneBackgroundCache;
}

/** Draws the complete composition, including FX, captions and watermark, without final joins/fades. */
export async function renderProjectCompositionScene(
  args: ProjectCompositionSceneInput
): Promise<void> {
  const { context, currentTime, job, project, settings, signal } = args;
  const assertLive = () => {
    if (job.cancelled || signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  };
  assertLive();
  let renderProject = project;
  if (hasCursorFollowingCameraAt(project, currentTime)) {
    job.cursorTrajectoryRenderer ??= createRecordingCursorTrajectoryRenderer();
    renderProject = await job.cursorTrajectoryRenderer.prepareCamera(project, settings, signal);
    assertLive();
  }
  if (project.actionFeedback?.some((group) => group.events)) {
    job.recordingEventsRenderer ??= createRecordingEventsRenderer();
    renderProject = await job.recordingEventsRenderer.prepare(
      renderProject,
      { start: currentTime, end: currentTime },
      signal
    );
    assertLive();
  }
  if (project.cursorTrack?.sourceObservations?.some((group) => group.trajectory))
    job.cursorTrajectoryRenderer ??= createRecordingCursorTrajectoryRenderer();
  renderProject = project.cursorTrack?.sourceObservations?.some((group) => group.trajectory)
    ? await job.cursorTrajectoryRenderer!.prepare(renderProject, currentTime)
    : renderProject;
  assertLive();
  job.captionRenderer ??= createVideoProjectCaptionRenderer();
  const captions = await job.captionRenderer.prepare(project, settings, signal);
  captions.assertExportable(
    args.captionSampleTime === undefined
      ? resolveProjectExportRange(project, settings)
      : { time: args.captionSampleTime }
  );
  const watermark =
    project.watermark && project.watermark.mode !== 'none'
      ? await getProjectExportWatermarkRenderer(job, signal).prepare(project, settings, signal)
      : undefined;
  if (!watermark) job.watermarkRenderer?.clear();
  const ownerDocument =
    args.ownerDocument ??
    (typeof HTMLCanvasElement !== 'undefined' && context.canvas instanceof HTMLCanvasElement
      ? context.canvas.ownerDocument
      : undefined);
  const renderPasses = job.sourceSampling?.managesSources
    ? resolveVideoCompositionRenderPasses(renderProject, currentTime, {
        includeSubtitles: settings.burnInSubtitles === true,
        cameraViewport: {
          width: settings.width,
          height: settings.height,
          ...(settings.resolution ? { resolution: settings.resolution } : {}),
        },
        ...(args.compositionIndex ? { timelineIndex: args.compositionIndex } : {}),
      })
    : undefined;
  const frameArgs = {
    ...(renderPasses ? { renderPasses } : {}),
    ...(args.compositionIndex ? { compositionIndex: args.compositionIndex } : {}),
    clipMediaElements: args.clipMediaElements,
    currentTime,
    ...(args.sourceSamplingFallback ? { sourceSamplingFallback: args.sourceSamplingFallback } : {}),
    loadedImages: args.loadedImages,
    ...(ownerDocument ? { ownerDocument } : {}),
    project: renderProject,
    ...(signal ? { signal } : {}),
    spatialRenderer: () => getProjectExportSpatialRenderer(job, signal),
    ...(job.sourceSampling ? { sourceSampling: job.sourceSampling } : {}),
  };
  let frames: Awaited<ReturnType<typeof renderOffscreenProjectEffectFrames>>;
  try {
    frames = await (args.effectRuntime
      ? args.effectRuntime.renderProjectFrames(frameArgs)
      : renderOffscreenProjectEffectFrames(frameArgs));
    assertLive();
    await drawProjectFrame(
      context,
      renderProject,
      settings,
      currentTime,
      args.loadedImages,
      args.clipMediaElements,
      {
        ...(renderPasses ? { renderPasses } : {}),
        spatialRenderer: frameArgs.spatialRenderer,
        ...(args.sourceSamplingFallback
          ? { sourceSamplingFallback: args.sourceSamplingFallback }
          : {}),
        ...(job.sourceSampling
          ? { sourceSampling: job.sourceSampling, ...(signal ? { signal } : {}) }
          : {}),
        ...(args.compositionIndex ? { compositionIndex: args.compositionIndex } : {}),
        ...(frames ? { effectRuntimeFrames: frames } : {}),
        ...(args.backgroundCache ? { backgroundCache: args.backgroundCache } : {}),
      }
    );
    assertLive();
    captions.draw(context, currentTime);
    watermark?.draw(context);
  } finally {
    disposeEffectRuntimeComposition(frames);
    job.sourceSampling?.releasePass();
  }
}
