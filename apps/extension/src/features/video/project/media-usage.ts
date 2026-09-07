import type { VideoProject } from './types';
import { VideoProjectClipType, VideoSceneBackgroundKind } from './types';

/** Counts project references regardless of track visibility, muting or locking. */
export function getProjectAssetUseCounts(project: VideoProject): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  const add = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const clip of project.clips) {
    if ('assetId' in clip) add(clip.assetId);
    if (clip.type === VideoProjectClipType.SHAPE && clip.embeddedAsset) {
      add(clip.embeddedAsset.assetId);
    }
  }
  if (project.sceneBackground?.kind === VideoSceneBackgroundKind.IMAGE) {
    add(project.sceneBackground.assetId);
  }
  for (const track of project.objectTracks ?? []) {
    if (track.analysis) add(track.analysis.sourceAssetId);
  }
  return counts;
}
