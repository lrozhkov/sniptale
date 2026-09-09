import {
  parseEffectV1Source,
  resolveEffectV1ObjectRenderBounds,
} from '@sniptale/runtime-contracts/effect-v1';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogDocumentEntry,
} from '../../features/video/project/effect-bundle/catalog';
import type { EffectRuntimeSandboxExecutor } from '../../contracts/effect-runtime/types';
import { createEffectRuntimeRenderMessage } from '../../features/video/composition/effect-runtime/runtime/request';
import type { EffectRuntimeFramePlan } from '../../features/video/composition/effect-runtime/runtime/types';

/** Produces one disposable bitmap using the same sandbox contract as timeline rendering. */
export async function renderEffectCatalogPreview(
  executor: EffectRuntimeSandboxExecutor,
  catalog: EffectBundleCatalogEntry,
  entry: EffectBundleCatalogDocumentEntry,
  progress: number,
  sequenceId: number,
  sourceFrame?: HTMLCanvasElement | null
): Promise<ImageBitmap> {
  const parsed = parseEffectV1Source(entry.source).document;
  if (!parsed) throw new Error('Invalid preview document');
  const time = progress * parsed.duration;
  const controls = Object.fromEntries(
    parsed.controls.map((control) => [control.id, control.defaultValue])
  );
  const body = parsed.objectLayout ?? { width: 640, height: 360 };
  const bounds = parsed.objectLayout?.handles?.length
    ? resolveEffectV1ObjectRenderBounds(parsed.objectLayout, controls)
    : undefined;
  const dimensions = bounds ? { width: bounds.width, height: bounds.height } : body;
  const width = Math.max(1, Math.round(320 * Math.min(1, dimensions.width / dimensions.height)));
  const height = Math.max(1, Math.round((width * dimensions.height) / dimensions.width));
  const assets = entry.assets.map((reference) => {
    const asset = catalog.assets.find((asset) => asset.sha256 === reference.sha256);
    if (!asset) throw new Error('Missing preview asset');
    return { ...asset, id: reference.id };
  });
  const plan: EffectRuntimeFramePlan = {
    assets,
    controls: Object.fromEntries(
      parsed.controls.map((control) => [control.id, control.defaultValue])
    ),
    dimensions,
    renderDimensions: { width, height },
    documentSha256: entry.sha256,
    documentSource: entry.source,
    duration: parsed.duration,
    effectInstanceId: 'catalog-preview',
    fps: 15,
    frameIndex: Math.floor(time * 15),
    kind: entry.kind,
    progress: progress,
    snapshotId: `effect:${entry.sha256}`,
    target: { kind: 'scene', clipId: 'catalog-preview' },
    time,
  };
  const inputs =
    entry.kind === 'targetEffect'
      ? { source: await sampleFrame(width, height, false, sourceFrame) }
      : entry.kind === 'transition'
        ? {
            from: await sampleFrame(width, height, false, sourceFrame),
            to: await sampleFrame(width, height, true),
          }
        : {};
  try {
    const command = await createEffectRuntimeRenderMessage({
      plan,
      inputFrames: inputs,
      requestId: crypto.randomUUID(),
      sequenceId,
    });
    const result = await executor.renderFrame(command);
    if (result.kind !== 'frame') throw new Error('Effect preview unavailable');
    return result.bitmap;
  } finally {
    for (const input of Object.values(inputs)) input.bitmap.close();
  }
}

async function sampleFrame(
  width: number,
  height: number,
  alternate: boolean,
  source?: HTMLCanvasElement | null
) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Preview canvas unavailable');
  if (source && source.width && source.height) {
    context.drawImage(source, 0, 0, width, height);
    return { bitmap: canvas.transferToImageBitmap(), width, height };
  }
  context.fillStyle = alternate ? '#203a58' : '#f0ebe5';
  context.fillRect(0, 0, width, height);
  context.fillStyle = alternate ? '#e5c9a2' : '#537993';
  context.fillRect(width * 0.12, height * 0.18, width * 0.5, height * 0.64);
  context.fillStyle = alternate ? '#e9eef5' : '#263c50';
  context.beginPath();
  context.arc(width * 0.72, height * 0.5, height * 0.2, 0, Math.PI * 2);
  context.fill();
  return { bitmap: canvas.transferToImageBitmap(), width, height };
}

/** Reserve room for entrance and exit instead of spending most of the scrub on a held frame. */
export function effectPreviewProgress(position: number, duration: number, kind: string): number {
  const x = Math.max(0, Math.min(0.999, position));
  if (kind === 'transition' || duration <= 2) return x;
  const edge = Math.min(0.25, 1 / duration);
  if (x < 0.4) return (x / 0.4) * edge;
  if (x > 0.6) return 1 - edge + ((x - 0.6) / 0.4) * edge;
  return edge + ((x - 0.4) / 0.2) * (1 - 2 * edge);
}

export function effectPosterKey(entry: EffectBundleCatalogDocumentEntry): string {
  return `poster-v2-320:${entry.sha256}:${entry.assets
    .map(({ id, sha256 }) => `${id}:${sha256}`)
    .sort()
    .join('|')}`;
}
