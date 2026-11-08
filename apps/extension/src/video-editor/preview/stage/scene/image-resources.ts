import type {
  VideoProjectVideoClip,
  VideoProjectImageClip,
} from '../../../../features/video/project/types';
import type {
  VideoCompositionFrame,
  VideoCompositionVisualLayer,
} from '../../../../features/video/composition/types';
import { windowHeaderImageKey } from '../../../../features/video/composition/draw/window-header';
import { getProjectSceneBackgroundImageAssetId } from '../../../../features/video/project/scene/background';
import type { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type {
  PreviewSceneRenderInput,
  PreviewSceneImageResources,
  PreviewImageResourceDemand,
} from './types';

/** Collect dependencies from the already resolved frame; never resample geometry or compose SVG. */
export function capturePreviewImageResources(
  input: Pick<PreviewSceneRenderInput, 'imageBank' | 'project' | 'assetUrls'>,
  passes: ReturnType<typeof resolveVideoCompositionRenderPasses>
): PreviewSceneImageResources {
  const demand = collectPreviewImageResourceDemand([
    passes.overlayFrame,
    ...passes.visualPasses.map((pass) => pass.frame),
  ]);
  const assets = new Set(demand.assets);
  const headers = new Set(demand.headers.keys());
  const background = getProjectSceneBackgroundImageAssetId(input.project);
  if (background) assets.add(background);
  const keys = new Set([...assets, ...headers]);
  const images: Record<string, HTMLImageElement> = {};
  const bindings = new Map<string, HTMLImageElement | undefined>();
  for (const key of keys) {
    const image = input.imageBank[key];
    const source = assets.has(key) ? input.assetUrls?.[key] : undefined;
    const matching = image && (!source || image.src === source) ? image : undefined;
    bindings.set(key, matching);
    if (matching) images[key] = matching;
  }
  const requiredAssets = new Set([...assets].filter((key) => Boolean(input.assetUrls?.[key])));
  return { images, bindings, headers, requiredAssets };
}

export function collectPreviewImageResourceDemand(
  frames: readonly VideoCompositionFrame[]
): PreviewImageResourceDemand {
  const assets = new Set<string>();
  const headers = new Map<string, VideoProjectVideoClip | VideoProjectImageClip>();
  for (const frame of frames)
    for (const layer of [...frame.visualLayers, ...frame.effectInputLayers])
      addLayerImageKeys(layer, assets, headers);
  return { assets, headers };
}

function addLayerImageKeys(
  layer: VideoCompositionVisualLayer,
  assets: Set<string>,
  headers: Map<string, VideoProjectVideoClip | VideoProjectImageClip>
): void {
  if (layer.kind === 'image') assets.add(layer.clip.assetId);
  if (layer.kind === 'shape' && layer.clip.embeddedAsset)
    assets.add(layer.clip.embeddedAsset.assetId);
  if (
    (layer.kind === 'video' || layer.kind === 'image') &&
    (layer.kind === 'image' || layer.trackRole !== 'CAMERA') &&
    layer.clip.windowHeader
  )
    headers.set(windowHeaderImageKey(layer.clipId, layer.clip.windowHeader), layer.clip);
}

/** Serial rendering prepares images once, then borrows the same snapshot through GPU fallback. */
export async function preparePreviewImageResources(
  input: PreviewSceneRenderInput,
  passes: ReturnType<typeof resolveVideoCompositionRenderPasses>
): Promise<PreviewSceneRenderInput | undefined> {
  if (input.prepareImages && !input.preparedFrame) {
    await input.prepareImages(
      [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)],
      input.signal
    );
    input.signal?.throwIfAborted();
  }
  let resources = input.preparedFrame?.imageResources;
  if (!resources) {
    resources = capturePreviewImageResources(input, passes);
    input.onImageResourcesPrepared?.(resources);
  }
  return arePreviewImageResourcesReady(resources)
    ? { ...input, imageBank: resources.images }
    : undefined;
}

/** Missing headers retain the current front; a completed failed decode keeps its existing error. */
export function arePreviewImageResourcesReady(resources: PreviewSceneImageResources): boolean {
  let ready = true;
  for (const key of new Set([...resources.headers, ...(resources.requiredAssets ?? [])])) {
    const image = resources.bindings.get(key);
    if (!image || !image.complete) {
      ready = false;
      continue;
    }
    if (image.naturalWidth === 0)
      throw new Error(
        resources.headers.has(key)
          ? 'Window header image could not be decoded.'
          : 'Preview media could not be decoded'
      );
  }
  return ready;
}

/** Retirement cannot change a borrowed image; relevant arrival or replacement invalidates a job. */
export function arePreviewImageResourcesCurrent(
  resources: PreviewSceneImageResources,
  incoming: Record<string, HTMLImageElement>
): boolean {
  for (const [key, image] of resources.bindings) {
    const current = incoming[key];
    if (current && current !== image) return false;
  }
  return true;
}
