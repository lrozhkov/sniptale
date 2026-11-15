import { readVerifiedCatalogDocument } from '../../features/video/project/effect-instance/catalog-reader';
import { applyInitialEffectPreset } from '../../features/video/project/effect-bundle/catalog/presets';
import { resolveAnimationObjectRenderBounds } from '@sniptale/runtime-contracts/animation-template';
import { resolveEffectControlDefault } from '@sniptale/runtime-contracts/effect-controls';
import { animationRuntimeDuration } from '../../contracts/effect-runtime/animation';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogDocumentEntry,
} from '../../features/video/project/effect-bundle/catalog';
import type { EffectRuntimeSandboxExecutor } from '../../contracts/effect-runtime/types';
import { createEffectRuntimeRenderMessage } from '../../features/video/composition/effect-runtime/runtime/request';
import type { EffectRuntimeFramePlan } from '../../features/video/composition/effect-runtime/runtime/types';

/** Timeline and catalog previews use the same verified package, local clock and immutable request. */
export async function renderEffectCatalogPreview(
  executor: EffectRuntimeSandboxExecutor,
  catalog: EffectBundleCatalogEntry,
  entry: EffectBundleCatalogDocumentEntry,
  progress: number,
  sequenceId: number,
  locale = 'en'
): Promise<ImageBitmap> {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1)
    throw new Error('Invalid preview time');
  const { document, catalogDocument } = await readVerifiedCatalogDocument(catalog, entry.id);
  if (catalogDocument.source === undefined) throw new Error('Missing animation source');
  const duration = animationRuntimeDuration(document),
    time = progress * duration;
  const controls = applyInitialEffectPreset(
    document,
    Object.fromEntries(
      document.controls.map((control) => [control.id, resolveEffectControlDefault(control, locale)])
    ),
    catalogDocument.presetPreferences,
    entry.previewPresetId
  );
  const bounds = resolveAnimationObjectRenderBounds(document, controls);
  const dimensions = { width: bounds.width, height: bounds.height };
  const width = Math.max(1, Math.round(320 * Math.min(1, dimensions.width / dimensions.height)));
  const height = Math.max(1, Math.round((width * dimensions.height) / dimensions.width));
  const plan: EffectRuntimeFramePlan = {
    assets: [],
    controls,
    dimensions,
    renderDimensions: { width, height },
    documentSha256: catalogDocument.sha256,
    documentSource: catalogDocument.source,
    duration,
    effectInstanceId: 'catalog-preview',
    fps: 15,
    frameIndex: Math.floor(time * 15),
    kind: 'standalone',
    progress,
    snapshotId: `effect:${catalogDocument.sha256}`,
    target: { kind: 'scene', clipId: 'catalog-preview' },
    time,
  };
  const result = await executor.renderFrame(
    await createEffectRuntimeRenderMessage({
      plan,
      inputFrames: {},
      requestId: crypto.randomUUID(),
      sequenceId,
    })
  );
  if (result.kind !== 'frame') throw new Error('Animation preview unavailable');
  return result.bitmap;
}

/** Reserve room for entrance and exit instead of spending most of the scrub on a held frame. */
export function effectPreviewProgress(position: number, duration: number): number {
  const x = Math.max(0, Math.min(0.999, position));
  if (duration <= 2) return x;
  const edge = Math.min(0.25, 1 / duration);
  if (x < 0.4) return (x / 0.4) * edge;
  if (x > 0.6) return 1 - edge + ((x - 0.6) / 0.4) * edge;
  return edge + ((x - 0.4) / 0.2) * (1 - 2 * edge);
}

export function effectPosterKey(
  entry: EffectBundleCatalogDocumentEntry,
  locale: string = 'en'
): string {
  const choice = entry.presetPreferences?.defaultPreset;
  const presetId =
    entry.previewPresetId ??
    (choice ? `${choice.kind === 'user' ? 'user:' : ''}${choice.id}` : 'default');
  const values = presetId.startsWith('user:')
    ? entry.presetPreferences?.presets.find((preset) => `user:${preset.id}` === presetId)?.values
    : undefined;
  return `poster-v3-320:${entry.sha256}:${locale}:${presetId}:${JSON.stringify(values)}:${entry.assets
    .map(({ id, sha256 }) => `${id}:${sha256}`)
    .sort()
    .join('|')}`;
}
