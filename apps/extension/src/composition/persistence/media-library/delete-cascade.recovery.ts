import { recordingAssetPublicationAdapter } from '../recordings/asset-publication';
import {
  projectAssetPublicationAdapter,
  projectExportPublicationAdapter,
} from '../projects/asset-publication';
import { webSnapshotPublicationAdapter } from '../web-snapshots/publication';
import { recoverSelectedAssetPublications } from '../assets/recovery';
import type {
  DurableAssetLifecyclePermit,
  PersistenceMutationTransitionPermit,
} from '../infrastructure/mutation-barrier';
import type { MediaDependencyTarget } from './dependencies';

/** Drain only this source owner's matching publications before removing its root. */
export async function recoverMediaSourcePublications(
  media: MediaDependencyTarget,
  options: {
    transitionPermit?: PersistenceMutationTransitionPermit;
    lifecyclePermit?: DurableAssetLifecyclePermit;
  } = {}
): Promise<void> {
  const adapters =
    media.source.kind === 'project-export' || media.source.kind === 'project-asset'
      ? [projectAssetPublicationAdapter, projectExportPublicationAdapter]
      : media.source.kind === 'recording'
        ? [recordingAssetPublicationAdapter]
        : media.source.kind === 'web-snapshot'
          ? [webSnapshotPublicationAdapter]
          : [];
  if (adapters.length) await recoverSelectedAssetPublications(adapters, media, options);
}
