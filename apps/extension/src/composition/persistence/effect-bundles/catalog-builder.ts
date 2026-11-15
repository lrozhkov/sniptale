import type { AnimationArtifactImportResult } from '../../../features/video/project/effect-bundle/lottie-profile';
import type { AnimationCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { assertAnimationCatalogIntegrity } from './integrity';
import { EffectBundlePersistenceError } from './errors';

/** Build the new package format without consulting legacy catalogs or browser preferences. */
export async function createAnimationCatalogEntry(
  artifact: Extract<AnimationArtifactImportResult, { ok: true }>,
  now: number
): Promise<AnimationCatalogEntry> {
  const first = artifact.documents[0];
  if (!first) throw new EffectBundlePersistenceError('catalogEntryInvalid');
  const entry: AnimationCatalogEntry = {
    format: 'sniptale-animation-catalog',
    version: 2,
    packId:
      artifact.package?.packId ??
      (artifact.kind === 'dotlottie'
        ? `dotlottie.${artifact.archiveSha256}`
        : `animation.${first.template.id}`),
    source: artifact.kind,
    sourceSha256: artifact.archiveSha256,
    label: artifact.package?.label ?? first.template.label,
    ...((artifact.package?.description ?? first.template.description)
      ? { description: artifact.package?.description ?? first.template.description }
      : {}),
    createdAt: now,
    updatedAt: now,
    documents: artifact.documents.map((document) => ({
      id: document.template.id,
      source: document.source,
      sha256: document.sha256,
    })),
    retainedByteLength: artifact.documents.reduce(
      (total, document) => total + new TextEncoder().encode(document.source).byteLength,
      0
    ),
  };
  await assertAnimationCatalogIntegrity(entry);
  return structuredClone(entry);
}
