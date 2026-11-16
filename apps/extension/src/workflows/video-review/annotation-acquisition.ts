import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { animationRuntimeDuration } from '../../contracts/effect-runtime/animation';
import { resolveEffectControlDefault } from '@sniptale/runtime-contracts/effect-controls';
import type { EffectBundleCatalogEntry } from '../../features/video/project/effect-bundle/catalog';
import { applyInitialEffectPreset } from '../../features/video/project/effect-bundle/catalog/presets';
import { readVerifiedCatalogDocument } from '../../features/video/project/effect-instance/catalog-reader';
import { initializeReviewAnnotationPlacement } from '../../features/video/review/annotation-effects/layout';
import { verifyReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/validation';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/types';
import type { createVideoReviewSession } from './session';

/** Content-free acquisition failure; the picker can explain unsupported catalog choices. */
export class ReviewAnnotationAcquisitionError extends Error {
  constructor(
    public readonly code:
      | 'catalog-disabled'
      | 'unsupported-kind'
      | 'invalid-range'
      | 'changed-source'
  ) {
    super(`Annotation acquisition failed: ${code}.`);
    this.name = 'ReviewAnnotationAcquisitionError';
  }
}

const acquisition = { readVerifiedCatalogDocument };

/** Applies one verified catalog document through the existing session's atomic history and resource admission. */
export async function applyReviewAnnotationCatalogDocument(
  args: {
    session: ReturnType<typeof createVideoReviewSession>;
    catalog: EffectBundleCatalogEntry;
    documentId: string;
    /** Captured UI command identity also identifies a locally admitted instance after Save failure. */
    instanceId?: string;
    start: number;
    end?: number;
    endMax?: number;
    timeDomain?: 'result';
    locale: string;
    presetId?: string;
    attachment?: ReviewAnnotationEffect['attachment'];
    /** Unzoomed source plane for content; canonical output canvas for viewport. */
    plane: { width: number; height: number };
    signal: AbortSignal;
  },
  deps = acquisition
): Promise<string> {
  const { session, signal } = args;
  signal.throwIfAborted();
  const source = session.getSnapshot().snapshot.workspace;
  const selected = args.catalog.documents.find((entry) => entry.id === args.documentId);
  if (!args.catalog.enabled || selected?.enabled === false)
    throw new ReviewAnnotationAcquisitionError('catalog-disabled');
  if (selected && selected.kind !== 'standalone')
    throw new ReviewAnnotationAcquisitionError('unsupported-kind');
  const loaded = await deps.readVerifiedCatalogDocument(args.catalog, args.documentId);
  signal.throwIfAborted();
  if (loaded.catalogDocument.kind !== 'standalone')
    throw new ReviewAnnotationAcquisitionError('unsupported-kind');
  const text = loaded.catalogDocument.source;
  if (text === undefined) throw new Error('Annotation source is unavailable.');
  const limit =
    args.timeDomain === 'result'
      ? buildReviewTimeMap(source.source.duration, session.getSnapshot().document.edits).at(-1)!
          .resultEnd
      : source.source.duration;
  const end =
    args.end ??
    Math.min(
      source.source.duration,
      args.endMax ?? Infinity,
      args.start + animationRuntimeDuration(loaded.document)
    );
  if (
    !Number.isFinite(args.start) ||
    !Number.isFinite(end) ||
    args.start < 0 ||
    end <= args.start ||
    end > limit ||
    !Number.isFinite(args.plane.width) ||
    !Number.isFinite(args.plane.height) ||
    args.plane.width <= 0 ||
    args.plane.height <= 0
  )
    throw new ReviewAnnotationAcquisitionError('invalid-range');
  const current = () => {
    const workspace = session.getSnapshot().snapshot.workspace;
    if (
      workspace.aggregateId !== source.aggregateId ||
      workspace.sourceAssetId !== source.sourceAssetId
    )
      throw new ReviewAnnotationAcquisitionError('changed-source');
    return workspace;
  };
  const previous = current().effectSnapshots?.find(
    (snapshot) => snapshot.id === `effect:${loaded.catalogDocument.sha256}`
  );
  const snapshot: ReviewAnnotationEffectSnapshot = previous ?? {
    id: `effect:${loaded.catalogDocument.sha256}`,
    sha256: loaded.catalogDocument.sha256,
    schemaVersion: 'sniptale.animation.v1',
    kind: 'standalone',
    documentId: loaded.document.id,
    source: text,
    retainedByteLength: new TextEncoder().encode(text).byteLength,
    assets: [],
  };
  const verified = await verifyReviewAnnotationEffectSnapshot(
    snapshot,
    async () => undefined,
    signal
  );
  const document = verified.document;
  const values = applyInitialEffectPreset(
    document,
    Object.fromEntries(
      document.controls.map((control) => [
        control.id,
        resolveEffectControlDefault(control, args.locale),
      ])
    ),
    loaded.catalogDocument.presetPreferences,
    args.presetId
  );
  const { transform, controls, anchors } = initializeReviewAnnotationPlacement(
    document,
    values,
    args.plane
  );
  const instance: ReviewAnnotationEffect = {
    id: args.instanceId ?? crypto.randomUUID(),
    snapshotId: snapshot.id,
    enabled: true,
    ...(args.timeDomain === 'result' ? { timeDomain: 'result' as const } : {}),
    start: args.start,
    end,
    attachment: args.attachment ?? 'content',
    transform,
    controls,
    ...(anchors ? { anchors } : {}),
    order: 0,
  };
  current();
  signal.throwIfAborted();
  await session.applyAnnotationEffect({
    expectedSourceAssetId: source.sourceAssetId,
    snapshot,
    instance,
    resources: [],
    signal,
  });
  return instance.id;
}
