import type { VideoProject } from './types';
import { VideoProjectClipType, VideoSceneBackgroundKind } from './types';

/** A project reference that keeps its source material in use. */
export type ProjectAssetUse = { assetId: string } & (
  | { kind: 'clip'; clipId: string }
  | { kind: 'scene' }
  | { kind: 'analysis'; objectTrackId: string }
);

/** Includes hidden and locked clips, scene media and analysis dependencies. */
export function getProjectAssetUses(project: VideoProject): ProjectAssetUse[] {
  const uses: ProjectAssetUse[] = [];
  for (const clip of project.clips) {
    if ('assetId' in clip) uses.push({ assetId: clip.assetId, kind: 'clip', clipId: clip.id });
    if (clip.type === VideoProjectClipType.SHAPE && clip.embeddedAsset) {
      uses.push({ assetId: clip.embeddedAsset.assetId, kind: 'clip', clipId: clip.id });
    }
  }
  if (project.sceneBackground?.kind === VideoSceneBackgroundKind.IMAGE) {
    uses.push({ assetId: project.sceneBackground.assetId, kind: 'scene' });
  }
  for (const track of project.objectTracks ?? []) {
    if (track.analysis)
      uses.push({
        assetId: track.analysis.sourceAssetId,
        kind: 'analysis',
        objectTrackId: track.id,
      });
  }
  return uses;
}

/** Counts project references regardless of track visibility, muting or locking. */
export function getProjectAssetUseCounts(project: VideoProject): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const use of getProjectAssetUses(project)) {
    counts.set(use.assetId, (counts.get(use.assetId) ?? 0) + 1);
  }
  return counts;
}
