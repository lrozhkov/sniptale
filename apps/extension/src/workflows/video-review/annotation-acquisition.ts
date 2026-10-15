import { resolveEffectV1ControlDefault } from '@sniptale/runtime-contracts/effect-v1';
import { prepareProjectAsset } from '../../composition/persistence/projects';
import { readVideoWorkspace } from '../../composition/persistence/review-workspaces/store';
import { collectReviewAssetReferences } from '../../composition/persistence/review-workspaces/asset-refs';
import type { EffectBundleCatalogEntry } from '../../features/video/project/effect-bundle/catalog';
import { applyInitialEffectPreset } from '../../features/video/project/effect-bundle/catalog/presets';
import { readVerifiedCatalogDocument } from '../../features/video/project/effect-instance/catalog-reader';
import { initializeReviewAnnotationPlacement } from '../../features/video/review/annotation-effects/layout';
import { verifyReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/validation';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/types';
import {
  createReviewAnnotationResourceRetention,
  type ReviewPreparedAnnotationResource,
} from './annotation-resources';
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

const acquisition = { prepareProjectAsset, readVideoWorkspace, readVerifiedCatalogDocument };

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
  if (
    loaded.document.kind !== 'standalone' ||
    loaded.assets.some(({ asset }) => asset.kind === 'audio')
  )
    throw new ReviewAnnotationAcquisitionError('unsupported-kind');
  const text = loaded.catalogDocument.source;
  if (text === undefined) throw new Error('Annotation source is unavailable.');
  const end = args.end ?? Math.min(source.source.duration, args.start + loaded.document.duration);
  if (
    !Number.isFinite(args.start) ||
    !Number.isFinite(end) ||
    args.start < 0 ||
    end <= args.start ||
    end > source.source.duration ||
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
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
    documentId: loaded.document.id,
    source: text,
    retainedByteLength:
      new TextEncoder().encode(text).byteLength +
      loaded.assets.reduce((sum, entry) => sum + entry.asset.byteLength, 0),
    assets: loaded.assets.map(({ asset, id, sha256 }) => {
      if (asset.kind === 'audio') throw new ReviewAnnotationAcquisitionError('unsupported-kind');
      return {
        id,
        assetId: `project-asset:${crypto.randomUUID()}`,
        kind: asset.kind,
        sha256,
        mimeType: asset.mimeType,
        byteLength: asset.byteLength,
      };
    }),
  };
  const blobs = new Map(
    snapshot.assets.map((entry) => [
      entry.assetId,
      loaded.assets.find((asset) => asset.id === entry.id)?.asset.blob,
    ])
  );
  const verified = await verifyReviewAnnotationEffectSnapshot(
    snapshot,
    async (reference) => blobs.get(reference),
    signal
  );
  const document = verified.document;
  const values = applyInitialEffectPreset(
    document,
    Object.fromEntries(
      document.controls.map((control) => [
        control.id,
        resolveEffectV1ControlDefault(control, args.locale),
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
    start: args.start,
    end,
    attachment: args.attachment ?? 'content',
    transform,
    controls,
    ...(anchors ? { anchors } : {}),
    order: 0,
  };
  const resources: ReviewPreparedAnnotationResource[] = [];
  const cleanup = createReviewAnnotationResourceRetention({
    readDurableReferences: async () => {
      const workspace = await deps.readVideoWorkspace(source.aggregateId);
      return workspace ? collectReviewAssetReferences(workspace.workspace) : new Set<string>();
    },
  });
  try {
    if (!previous)
      for (const asset of verified.assets) {
        signal.throwIfAborted();
        current();
        const prepared = await deps.prepareProjectAsset(
          asset.blob,
          asset.mimeType,
          asset.id,
          asset.assetId.slice('project-asset:'.length),
          Date.now(),
          undefined,
          {
            publishToLibrary: false,
            requiredReviewAnnotationEffect: {
              aggregateId: source.aggregateId,
              sourceAssetId: source.sourceAssetId,
              snapshotId: snapshot.id,
              resourceId: asset.id,
              sha256: asset.sha256,
            },
          }
        );
        let release: () => Promise<void> = async () => undefined;
        resources.push({
          assetId: asset.assetId,
          physicalAssetId: prepared.ref.assetId,
          publish: prepared.publish,
          cancel: prepared.cancel,
          release: () => release(),
          read: (signal) => {
            if (!prepared.readForSession)
              throw new Error('Annotation resource reader is unavailable.');
            return prepared.readForSession(signal);
          },
        });
        release = await prepared.retainForSession();
        signal.throwIfAborted();
      }
    current();
    signal.throwIfAborted();
    await session.applyAnnotationEffect({
      expectedSourceAssetId: source.sourceAssetId,
      snapshot,
      instance,
      resources,
      signal,
    });
    return instance.id;
  } catch (error) {
    const unowned = resources.filter((resource) => !session.ownsAnnotationResource(resource));
    cleanup.admit(unowned, new Set(snapshot.assets.map((asset) => asset.assetId)));
    try {
      await cleanup.dispose();
    } catch {
      throw new AggregateError([error], 'Annotation acquisition cleanup is deferred.');
    }
    throw error;
  }
}
