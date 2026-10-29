import type { ApplyPreparedVideoProjectRevisionInput } from '../../composition/persistence/sync-capture/apply-video-project';
import type { VideoProjectEntry } from '../../composition/persistence/projects/contracts';
import {
  MAX_CAPTURE_ROWS,
  type CausalRootDependency,
} from '../../composition/persistence/sync-capture/contracts';
import {
  parsePreparedScenarioProjectDependencies,
  type PreparedScenarioProjectDependency,
} from '../../composition/persistence/sync-capture/scenario-dependencies';

import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetRef } from '../../composition/persistence/assets/contracts';
import { parsePreparedScenarioReplicaRoot } from '../../composition/persistence/sync-capture/prepared-scenario';
import { prepareScenarioProjectPublication } from '../media-hub-backup/v6/root-publication/scenario-project-publication';
import type { PortableScenarioProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';

type ScenarioDependencyRoot =
  | {
      kind: 'video-project';
      entry: { project: Pick<VideoProjectEntry['project'], 'assets' | 'source'> };
    }
  | { kind: 'media' | 'image' | 'video-review' | 'scenario-project' };

/** Reuse archive decoding, preserving normal-sync logical IDs and target-owned borrowed sources. */
export async function preparePortableScenarioRoot(args: {
  metadata: PortableScenarioProjectMetadata;
  admission: Pick<
    ApplyPreparedVideoProjectRevisionInput,
    'dependencies' | 'expectedWorkspaceRevision'
  >;
  refFor: (id: string) => AssetRef;
  stageNativeMetadata: (blob: Blob) => Promise<AssetRef>;
  objectIds: readonly string[];
}) {
  const prepared = await prepareScenarioProjectPublication({
    metadata: args.metadata,
    rootId: args.metadata.entry.id,
    sourceExists: args.admission.expectedWorkspaceRevision !== null,
    session: {
      strategy: 'replace',
      rootIdMap: Object.fromEntries(
        args.admission.dependencies.map((item) => [
          `media:library-item:${item.entry.id}`,
          item.entry.id,
        ])
      ),
    },
    staged: args.objectIds.map((objectId) => ({ objectId, ref: args.refFor(objectId) })),
  });
  const { history, ...entry } = prepared.root.entry;
  const historyText = history?.length ? JSON.stringify(history) : null;
  const historyRef =
    historyText === null
      ? undefined
      : {
          ...(await args.stageNativeMetadata(
            new Blob([historyText], { type: 'application/json' })
          )),
          sha256: Array.from(sha256(new TextEncoder().encode(historyText)), (byte) =>
            byte.toString(16).padStart(2, '0')
          ).join(''),
        };
  const thumbnails = [
    ...(args.metadata.thumbnail
      ? [{ metadata: args.metadata.thumbnail, assetId: `scenario:${entry.id}` }]
      : []),
    ...args.metadata.exportThumbnails.map((item) => ({
      metadata: item.thumbnail,
      assetId: `scenario-export:${item.exportId}`,
    })),
  ].map(({ metadata, assetId }) => ({
    entry: {
      assetId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      width: metadata.width,
      height: metadata.height,
    },
    ref: args.refFor(metadata.objectId),
  }));
  const presentation = args.metadata.presentation;
  if (!isRecord(entry.project)) throw new Error('Invalid prepared Scenario document.');
  return parsePreparedScenarioReplicaRoot({
    entry,
    assets: prepared.root.assets,
    exports: prepared.root.exports,
    exportRefs: prepared.root.exportRefs ?? [],
    stepDocuments: prepared.root.stepDocuments,
    thumbnails,
    ...(historyRef ? { historyRef } : {}),
    ...(presentation
      ? {
          presentation: {
            entry: presentation.entry,
            thumbnailRef: args.refFor(presentation.thumbnailObjectId),
            ...(presentation.previewObjectId
              ? { previewRef: args.refFor(presentation.previewObjectId) }
              : {}),
          },
        }
      : {}),
  });
}

/** Bind each actual Scenario source to one declared owning root, without admitting extra children. */
export function portableSyncRootDependencyIds(
  parsed: ScenarioDependencyRoot,
  declared: readonly CausalRootDependency[] = []
): string[] {
  if (parsed.kind !== 'video-project') {
    if (declared.length) throw new Error('Unexpected portable root dependencies.');
    return [];
  }
  const needed = new Set(
    parsed.entry.project.assets.flatMap((asset) =>
      asset.source.kind === 'scenario-asset' ? [asset.source.scenarioAssetId] : []
    )
  );
  const source = parsed.entry.project.source;
  const provenance = source.kind === 'scenario' ? source.scenarioProjectId : undefined;
  const children = declared.flatMap((item) => item.childIds);
  if (
    declared.length > MAX_CAPTURE_ROWS ||
    new Set(declared.map((item) => item.rootId)).size !== declared.length ||
    children.length !== needed.size ||
    new Set(children).size !== children.length ||
    children.some((id) => !needed.has(id)) ||
    declared.some(
      (item) =>
        item.rootKind !== 'scenario-project' ||
        (!item.childIds.length && item.rootId !== provenance)
    ) ||
    (provenance && !declared.some((item) => item.rootId === provenance))
  )
    throw new Error('Portable Scenario dependency inventory differs from its authored sources.');
  return declared.map((item) => item.rootId).sort();
}

export function assertScenarioCausalDependencies(
  parsed: ScenarioDependencyRoot,
  local: { rootDependencies?: ApplyPreparedVideoProjectRevisionInput['rootDependencies'] },
  sender: readonly CausalRootDependency[]
) {
  const needed = portableSyncRootDependencyIds(parsed, sender);
  const admitted = parsePreparedScenarioProjectDependencies(local.rootDependencies ?? []);
  if (
    admitted.length !== needed.length ||
    admitted.some((item) => {
      const causal = sender.find((dependency) => dependency.rootId === item.rootId);
      return (
        !causal ||
        JSON.stringify(causal.basis) !== JSON.stringify(item.expectedBasis) ||
        JSON.stringify([...causal.childIds].sort()) !==
          JSON.stringify(item.children.map((child) => child.entry.id).sort())
      );
    })
  )
    throw new Error('Portable Scenario dependency differs from admitted native head.');
}

/** Reuse the existing backup transformer's exact root and child identity maps. */
export function scenarioDependencyReferenceMaps(
  dependencies: readonly PreparedScenarioProjectDependency[]
) {
  const roots = new Map<string, string>();
  const children = new Map<string, string>();
  for (const dependency of dependencies) {
    roots.set(`scenario-project:${dependency.rootId}`, dependency.rootId);
    for (const child of dependency.children)
      children.set(`scenario-asset:${child.entry.id}`, child.entry.id);
  }
  return { rootIdMap: Object.fromEntries(roots), childIdMap: Object.fromEntries(children) };
}
