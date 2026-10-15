import { recoverRecordingAssetPublications } from '../recordings/asset-publication';
import { recoverProjectMediaPublications } from '../projects/asset-publication';
import { recoverWebSnapshotPublications } from '../web-snapshots/publication';
import type { MediaDependencyTarget } from './dependencies';

/** Drain the source owner's ready publications before its root is removed. */
export async function recoverMediaSourcePublications(media: MediaDependencyTarget): Promise<void> {
  if (media.source.kind === 'project-export' || media.source.kind === 'project-asset')
    await recoverProjectMediaPublications();
  if (media.source.kind === 'recording') await recoverRecordingAssetPublications();
  if (media.source.kind === 'web-snapshot') await recoverWebSnapshotPublications();
}
