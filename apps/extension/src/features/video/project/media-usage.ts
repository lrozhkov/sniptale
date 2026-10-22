import { getSourceVoiceoverAssetReferences } from './source-voiceover';
import { getVideoProjectWatermarkAsset } from './scene/watermark';
import type { VideoProject } from './types';
import { VideoProjectClipType, VideoSceneBackgroundKind } from './types';

/** A project reference that keeps its source material in use. */
export type ProjectAssetUse = { assetId: string } & (
  | { kind: 'clip'; clipId: string }
  | { kind: 'scene' }
  | { kind: 'composition-join'; joinId: string }
  | { kind: 'watermark' }
  | { kind: 'bookend-preset'; side: 'intro' | 'outro'; variant: 'image' | 'video' }
  | { kind: 'analysis'; objectTrackId: string }
  | { kind: 'text'; documentId: string }
  | { kind: 'comments'; documentId: string }
  | { kind: 'source-audio'; documentId: string }
  | { kind: 'source-voiceover'; documentId: string }
);

/** Includes hidden clips, scene media, analysis and dormant source-text dependencies. */
export function getProjectAssetUses(project: VideoProject): ProjectAssetUse[] {
  const uses: ProjectAssetUse[] = [];
  for (const clip of project.clips) {
    if ('assetId' in clip) uses.push({ assetId: clip.assetId, kind: 'clip', clipId: clip.id });
    if (clip.type === VideoProjectClipType.SHAPE && clip.embeddedAsset) {
      uses.push({ assetId: clip.embeddedAsset.assetId, kind: 'clip', clipId: clip.id });
    }
  }
  const joins = [...(project.compositionJoins ?? [])].sort(
    (a, b) => (a.sourceRange?.start ?? 0) - (b.sourceRange?.start ?? 0)
  );
  for (const join of joins) {
    if (join.sourceRange)
      uses.push({ assetId: join.sourceRange.assetId, kind: 'composition-join', joinId: join.id });
  }
  if (project.sceneBackground?.kind === VideoSceneBackgroundKind.IMAGE) {
    uses.push({ assetId: project.sceneBackground.assetId, kind: 'scene' });
  }
  for (const side of ['intro', 'outro'] as const) {
    const slot = project.bookendPresets?.[side];
    for (const variant of ['image', 'video'] as const) {
      const recipe = slot?.[variant];
      if (recipe) uses.push({ assetId: recipe.assetId, kind: 'bookend-preset', side, variant });
    }
  }
  const watermarkAsset = getVideoProjectWatermarkAsset(project);
  if (watermarkAsset) uses.push({ assetId: watermarkAsset.id, kind: 'watermark' });
  const rememberedImage = project.sceneBackground?.remembered?.image;
  if (
    rememberedImage &&
    (project.sceneBackground?.kind !== VideoSceneBackgroundKind.IMAGE ||
      rememberedImage.assetId !== project.sceneBackground.assetId)
  ) {
    uses.push({ assetId: rememberedImage.assetId, kind: 'scene' });
  }
  for (const track of project.objectTracks ?? []) {
    if (track.analysis)
      uses.push({
        assetId: track.analysis.sourceAssetId,
        kind: 'analysis',
        objectTrackId: track.id,
      });
  }
  for (const entry of project.textDocuments ?? []) {
    if (entry.binding.kind === 'source')
      uses.push({ assetId: entry.binding.assetId, kind: 'text', documentId: entry.id });
  }
  for (const entry of project.commentDocuments ?? []) {
    if (entry.binding.kind === 'source')
      uses.push({ assetId: entry.binding.assetId, kind: 'comments', documentId: entry.id });
  }
  for (const document of project.sourceAudioDocuments ?? []) {
    uses.push({ assetId: document.binding.assetId, kind: 'source-audio', documentId: document.id });
    for (const replacement of document.speech?.transcript.replacements ?? [])
      uses.push({ assetId: replacement.assetId, kind: 'source-audio', documentId: document.id });
  }
  for (const document of project.sourceVoiceoverDocuments ?? []) {
    for (const reference of getSourceVoiceoverAssetReferences(document))
      uses.push({ assetId: reference.assetId, kind: 'source-voiceover', documentId: document.id });
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
