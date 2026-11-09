import { resolveCompositionSceneSpotlights } from '../../../features/video/composition/draw/project-spotlight';
import type { QuickEditHomography } from '../../../features/video/composition/motion/spatial-geometry';
import type { VideoCompositionFrame } from '../../../features/video/composition/types';
import { resolveProjectOutputTransform } from '../../../features/video/project/export/output-dimensions';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../features/video/project/types';
import type { ProjectExportSourceSampling } from './source-sampling';
import { projectNativeSamplingRect } from './source-sampling-plan';

export interface NativeSharpStage {
  readonly id: string;
  readonly afterClipId?: string;
  readonly context: CanvasRenderingContext2D;
  readonly output: { width: number; height: number };
  readonly transform: QuickEditHomography;
  finished: boolean;
  paint(draw: (context: CanvasRenderingContext2D) => void): void;
  publish(context: CanvasRenderingContext2D): void;
  dispose(): void;
}
/** Concrete lens ROI targets retain only the existing stage's sharp pixels, never model inputs. */
export function createNativeSharpStages(args: {
  project: VideoProject;
  settings: VideoProjectExportSettings;
  frame: VideoCompositionFrame;
  images: Record<string, HTMLImageElement>;
  sampling: ProjectExportSourceSampling;
  document?: Document;
}): NativeSharpStage[] {
  const output = resolveProjectOutputTransform(args.project, args.settings);
  const stages: NativeSharpStage[] = [];
  try {
    for (const state of args.frame.sceneSpotlights ?? []) {
      const lens = resolveCompositionSceneSpotlights({
        project: args.project,
        frame: { ...args.frame, sceneSpotlights: [state] },
        images: args.images,
        viewport: { x: 0, y: 0, width: args.settings.width, height: args.settings.height },
        composition: { x: output.offsetX, y: output.offsetY, scale: output.scale },
        transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      })[0];
      if (
        !lens?.lens ||
        lens.lens.scale <= 1 ||
        lens.opening.width <= 0 ||
        lens.opening.height <= 0
      )
        continue;
      const extent = lens.projection
        ? projectNativeSamplingRect(lens.projection, lens.opening)
        : lens.opening;
      const x = Math.max(0, Math.floor(extent.x)),
        y = Math.max(0, Math.floor(extent.y));
      const width = Math.min(args.settings.width, Math.ceil(extent.x + extent.width)) - x,
        height = Math.min(args.settings.height, Math.ceil(extent.y + extent.height)) - y;
      if (width <= 0 || height <= 0) continue;
      const release = args.sampling.reserveRaster(width, height);
      let canvas: HTMLCanvasElement | undefined;
      try {
        canvas = (args.document ?? document).createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Sharp export stage is unavailable.');
        const scale = lens.lens.scale,
          cx = extent.x + extent.width / 2,
          cy = extent.y + extent.height / 2;
        const transform: QuickEditHomography = [
          scale,
          0,
          cx * (1 - scale) - x,
          0,
          scale,
          cy * (1 - scale) - y,
          0,
          0,
          1,
        ];
        let disposed = false;
        const image = canvas;
        stages.push({
          id: `sceneLens:${state.id}`,
          ...(state.afterClipId ? { afterClipId: state.afterClipId } : {}),
          context,
          output: { width, height },
          transform,
          finished: false,
          paint(draw) {
            context.save();
            try {
              context.setTransform(
                transform[0],
                transform[3],
                transform[1],
                transform[4],
                transform[2],
                transform[5]
              );
              draw(context);
            } finally {
              context.restore();
            }
          },
          publish(target) {
            if (disposed) throw new Error('Sharp export stage is disposed.');
            this.finished = true;
            target.drawImage(image, x, y, width, height);
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            image.width = image.height = 0;
            release();
          },
        });
      } catch (error) {
        if (canvas) canvas.width = canvas.height = 0;
        release();
        throw error;
      }
    }
    return stages;
  } catch (error) {
    for (const stage of stages) stage.dispose();
    throw error;
  }
}
