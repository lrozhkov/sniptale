import type { CanvasCommentExport } from '../../features/video/review/comments';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import type { ReviewRecordingRenderSource } from './recording-render';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';
import type { ReviewFrameWindow } from './render-schedule';
import { createAdaptiveComparisonBudget } from '../../features/video/project/export/adaptive-frames';
import type { VideoSample, VideoSampleSink } from 'mediabunny';
import type { ReviewCutTransitionPlan } from '../../features/video/review/cuts';
import type { createReviewTransitionFrames } from './cut-transition-frames';
import type { createReviewWebcamRenderer } from './render-webcam';
import type { WatermarkRenderer } from '../../features/video/composition/canvas/watermark';
import type { prepareReviewFinalCaptions } from './render-captions';
import type { ExportEnhancer } from '../../features/video/composition/export-enhancement/enhancer';
import { createReviewPreviewRenderer } from './render-preview';
import { createPreviewRenderResources } from './preview-render-resources';
import { reviewCutTransitionAt } from '../../features/video/review/cuts';
import type { QuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { renderSharedCompositionWindow } from './render-export';

interface ReviewRenderScene {
  sourceSize: { width: number; height: number };
  baseCanvas?: { width: number; height: number };
  windowHeader?: QuickEditAdvancedState['windowHeader'];
  background: QuickEditAdvancedState['background'];
  comments: readonly CanvasCommentExport[];
  clickCues?: readonly ReviewClickCue[] | undefined;
  zoomRegions: readonly QuickEditZoomRegion[];
  sceneScale?: number;
  headerImage?: CanvasImageSource | null;
  image: ImageBitmap | null;
}

/** Exercises the production writer and shared compositor with controlled decoded inputs. */
export async function renderRenderWindowFrames(
  args: ReviewRenderScene & {
    recordingHistory?: ReviewRecordingRenderSource;
    keyCues?: readonly ReviewKeyCue[] | undefined;
    window: ReviewFrameWindow;
    adaptive?: boolean;
    adaptiveBudget?: ReturnType<typeof createAdaptiveComparisonBudget>;
    fps: number;
    fragmentOffset: number;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    frameSink: Pick<VideoSampleSink, 'samplesAtTimestamps'>;
    sourceTimeResolution?: number;
    leadingSampleTime?: number;
    transitions?: readonly ReviewCutTransitionPlan[];
    transitionFrames?: ReturnType<typeof createReviewTransitionFrames> | null;
    webcamSettings?: QuickEditWebcam;
    webcam?: Awaited<ReturnType<typeof createReviewWebcamRenderer>> | null;
    watermark?: WatermarkRenderer | null;
    captions?: Awaited<ReturnType<typeof prepareReviewFinalCaptions>>;
    videoOut: { add(sample: VideoSample): Promise<void>; close(): void };
    resultDuration: number;
    onProgress: ((fraction: number) => void) | undefined;
    signal: AbortSignal;
    exportEnhancer?: ExportEnhancer;
  }
): Promise<number> {
  const resources = createPreviewRenderResources({
    maximumManagedBytes: 512 * 1024 * 1024,
    maximumCanvases: 128,
    createCanvas: () => {
      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'getContext', { value: () => args.context });
      return canvas;
    },
  });
  const renderer = createReviewPreviewRenderer({ resources, renderer: 'legacy' });
  const prepared = await renderer.prepare(
    {
      source: args.sourceSize,
      ...(args.baseCanvas ? { canvas: args.baseCanvas } : {}),
      background: args.background,
      ...(args.windowHeader ? { windowHeader: args.windowHeader } : {}),
      zoomRegions: args.zoomRegions,
      comments: args.comments,
      keys: args.keyCues ?? [],
      clicks: args.clickCues ?? [],
      ...(args.webcamSettings ? { webcam: args.webcamSettings } : {}),
    },
    {
      canonical: args.baseCanvas ?? { width: args.canvas.width, height: args.canvas.height },
      backing: { width: args.canvas.width, height: args.canvas.height },
    },
    args.signal
  );
  const samples = args.frameSink.samplesAtTimestamps(args.window.sourceTimes);
  const cameraFrames = args.webcam?.sourceFrames(args.window.sourceTimes);
  let index = 0;
  try {
    return await renderSharedCompositionWindow({
      ...args,
      adaptive: args.adaptive ?? false,
      adaptiveBudget: args.adaptiveBudget ?? createAdaptiveComparisonBudget(),
      main: {
        async renderAtTime(timestamp: number) {
          const sample = (await samples.next()).value;
          if (!sample) throw new Error('Source frame is unavailable.');
          try {
            const camera = (await cameraFrames?.next())?.value;
            const blend = reviewCutTransitionAt(timestamp, args.transitions ?? []);
            const endpoints = blend ? await args.transitionFrames?.load(blend.plan) : null;
            return await renderer.render(
              prepared,
              {
                generation: ++index,
                ...(blend && endpoints
                  ? { transition: { blend, frames: endpoints, resultOffset: args.fragmentOffset } }
                  : {}),
                fps: args.fps,
                sourceTime: args.window.sourceTimes[index - 1]!,
                resultTime: timestamp + args.fragmentOffset,
                source: {
                  timestamp: sample.timestamp,
                  backing: args.sourceSize,
                  draw: sample.draw.bind(sample),
                },
                ...(args.recordingHistory ? { recordingHistory: args.recordingHistory } : {}),
                ...(camera
                  ? {
                      camera: {
                        representedMediaTime: camera.representedMediaTime,
                        generation: index,
                        source: camera.source,
                        placement: camera.placement,
                        ...(camera.crop ? { crop: camera.crop } : {}),
                        drawable: camera.drawable,
                      },
                    }
                  : {}),
              },
              args.signal
            );
          } finally {
            sample.close();
          }
        },
      },
    });
  } finally {
    try {
      await cameraFrames?.return(undefined);
    } finally {
      await samples.return?.(undefined);
      prepared.release();
      renderer.dispose();
      resources.dispose();
    }
  }
}
