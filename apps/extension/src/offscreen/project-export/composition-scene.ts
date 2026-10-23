import { disposeEffectRuntimeComposition } from '../../features/video/composition/effect-runtime';
import type { VideoCompositionTimelineIndex } from '../../features/video/composition/timeline/frame/index';
import { resolveProjectExportRange } from '../../features/video/project/export/range';
import type { VideoProject } from '../../features/video/project/types/model';
import type { VideoProjectExportSettings } from '../../features/video/project/types/export';
import { createVideoProjectCaptionRenderer } from '../../workflows/video-review/project-captions';
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
  job: Pick<
    ExportJobState,
    'cancelled' | 'cameraSpatialRenderer' | 'captionRenderer' | 'watermarkRenderer'
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
  const frameArgs = {
    ...(args.compositionIndex ? { compositionIndex: args.compositionIndex } : {}),
    clipMediaElements: args.clipMediaElements,
    currentTime,
    loadedImages: args.loadedImages,
    ...(ownerDocument ? { ownerDocument } : {}),
    project,
    ...(signal ? { signal } : {}),
    spatialRenderer: () => getProjectExportSpatialRenderer(job, signal),
  };
  const frames = await (args.effectRuntime
    ? args.effectRuntime.renderProjectFrames(frameArgs)
    : renderOffscreenProjectEffectFrames(frameArgs));
  try {
    assertLive();
    await drawProjectFrame(
      context,
      project,
      settings,
      currentTime,
      args.loadedImages,
      args.clipMediaElements,
      {
        spatialRenderer: frameArgs.spatialRenderer,
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
  }
}
