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
  if (parseEnhancementMode(input.settings.detailEnhancement) !== 'off') return false;
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
