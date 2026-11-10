import { PreviewGpuSerialFallback } from '../../workflows/video/native-composition/render-scene';
import { isVideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import type { NativePreparedSourcePass } from './renderer/source-sampling';
import { createNativeCompositionMaterializer } from '../../workflows/video/native-composition/materializer';
import { resolveProjectExportRange } from '../../features/video/project/export/range';
import { parseEnhancementMode } from '../../features/video/composition/export-enhancement/mode';
import { loadBlobForAsset } from './media-loading/blob';
import type { ProjectCompositionSceneInput } from './composition-scene';
import type { ProjectExportRuntimeState } from './types';

type Input = ProjectCompositionSceneInput & {
  job: ProjectCompositionSceneInput['job'] & Pick<ProjectExportRuntimeState, 'sharedComposition'>;
};

/** Export owns mandatory frame order and admission; the common materializer builds the image. */
export interface SharedProjectExportComposition {
  readonly project: Input['project'];
  readonly settings: Input['settings'];
  render(input: Input): Promise<void>;
  dispose(): void;
}

/** Enhanced sources retain their existing route until their shared GPU adapter is admitted. */
export async function renderSharedProjectComposition(input: Input): Promise<boolean> {
  const enhanced = parseEnhancementMode(input.settings.detailEnhancement) !== 'off';
  if (
    enhanced &&
    (typeof VideoFrame === 'undefined' || !navigator.gpu || !input.job.sourceSampling)
  )
    return false;
  let owner = input.job.sharedComposition;
  if (owner && (owner.project !== input.project || owner.settings !== input.settings)) {
    delete input.job.sharedComposition;
    owner.dispose();
    owner = undefined;
  }
  owner ??= createSharedProjectComposition(input);
  input.job.sharedComposition = owner;
  try {
    await owner.render(input);
    return true;
  } catch (error) {
    if (input.job.sharedComposition === owner) delete input.job.sharedComposition;
    owner.dispose();
    if (error instanceof PreviewGpuSerialFallback) return false;
    throw error;
  }
}

function createSharedProjectComposition(input: Input): SharedProjectExportComposition {
  const { project, settings } = input;
  const ownerDocument = input.ownerDocument ?? input.context.canvas.ownerDocument;
  const assetUrls: Record<string, string> = {};
  for (const clip of project.clips) {
    if (!('assetId' in clip)) continue;
    const media = input.clipMediaElements.get(clip.id);
    const url = media instanceof HTMLMediaElement ? media.currentSrc || media.src : undefined;
    if (url) assetUrls[clip.assetId] = url;
  }
  for (const [id, image] of Object.entries(input.loadedImages))
    if (image.currentSrc || image.src) assetUrls[id] = image.currentSrc || image.src;
  const lifetime = new AbortController();
  let captionSampleTime = input.captionSampleTime;
  let currentInput = input;
  const enhanced = parseEnhancementMode(settings.detailEnhancement) !== 'off';
  const materializer = createNativeCompositionMaterializer({
    project,
    ownerDocument,
    assetUrls,
    readAsset: loadBlobForAsset,
    rasterSize: settings,
    sampleFps: settings.fps,
    sceneOutput: {
      width: settings.width,
      height: settings.height,
      resolution: settings.resolution,
      includeSubtitles: settings.burnInSubtitles === true,
    },
    sourceDiscontinuity: false,
    ...(enhanced
      ? {
          requireGpu: true,
          async prepareSources(scene, passes, endpointFallback) {
            const sampling = currentInput.job.sourceSampling;
            if (!sampling) throw new Error('Enhanced export source owner is unavailable.');
            const contexts = [
              { frame: passes.overlayFrame, time: scene.currentTime },
              ...passes.visualPasses.map((pass) => ({ frame: pass.frame, time: pass.time })),
            ];
            await scene.prepareImages?.(
              contexts.map(({ frame }) => frame),
              scene.signal
            );
            const owned = new Map<object, Map<number, NativePreparedSourcePass>>();
            const release = () => {
              for (const times of owned.values()) for (const pass of times.values()) pass.release();
              owned.clear();
            };
            try {
              for (const context of contexts) {
                let times = owned.get(context.frame);
                if (!times) {
                  times = new Map();
                  owned.set(context.frame, times);
                }
                if (times.has(context.time)) continue;
                const pass = await sampling.prepare({
                  project: scene.project,
                  frame: context.frame,
                  time: context.time,
                  sceneTime: scene.currentTime,
                  lensFrame: passes.overlayFrame,
                  media: currentInput.clipMediaElements,
                  images: scene.imageBank,
                  ...((endpointFallback ?? currentInput.sourceSamplingFallback)
                    ? { fallback: (endpointFallback ?? currentInput.sourceSamplingFallback)! }
                    : {}),
                  ...(scene.signal ? { signal: scene.signal } : {}),
                  retain: true,
                });
                times.set(context.time, pass);
              }
              const selected = (frame: object, time: number) => {
                const pass = owned.get(frame)?.get(time);
                if (!pass) throw new Error('Enhanced export exposure is unavailable.');
                return pass;
              };
              const media = (frame: object, time: number) => {
                const result = new Map<string, VideoCompositionFrameSource>();
                for (const [id, source] of selected(frame, time).media)
                  if (isVideoCompositionFrameSource(source) && source.toVideoFrame)
                    result.set(id, source);
                return result;
              };
              return {
                nominal: media(passes.overlayFrame, scene.currentTime),
                bindings: new Map(),
                media,
                sampling: selected,
                release,
              };
            } catch (error) {
              release();
              throw error;
            }
          },
        }
      : {}),
    assertCaptions(captions) {
      captions.assertExportable(
        captionSampleTime === undefined
          ? resolveProjectExportRange(project, settings)
          : { time: captionSampleTime }
      );
    },
  });
  const assertLive = (current: Input) => {
    if (current.job.cancelled || current.signal?.aborted || lifetime.signal.aborted)
      throw new Error('PROJECT_EXPORT_CANCELLED');
  };
  return {
    project,
    settings,
    async render(current) {
      assertLive(current);
      currentInput = current;
      captionSampleTime = current.captionSampleTime;
      const signal = current.signal
        ? AbortSignal.any([lifetime.signal, current.signal])
        : lifetime.signal;
      const completed = await materializer.renderFrame(current.currentTime, signal);
      assertLive(current);
      current.context.save();
      try {
        current.context.setTransform(1, 0, 0, 1, 0, 0);
        current.context.globalAlpha = 1;
        current.context.globalCompositeOperation = 'copy';
        current.context.filter = 'none';
        current.context.drawImage(completed, 0, 0);
      } finally {
        current.context.restore();
      }
    },
    dispose() {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      materializer.dispose();
    },
  };
}
