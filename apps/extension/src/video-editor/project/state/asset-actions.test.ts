import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import {
  VideoBlockKind,
  VideoOverlayTemplateKind,
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoProjectShapeType,
  VideoTrackKind,
} from '../../../features/video/project/types';
import {
  addAssetClipToProject,
  addAnnotationOverlayToProject,
  addShapeOverlayToProject,
  addSubtitleOverlayToProject,
  addTextOverlayToProject,
  addVideoBlockToProject,
} from './asset-actions';

function createAsset(type: VideoProjectAssetType, name: string, hasAudio = false) {
  return createVideoProjectAsset(
    name,
    type,
    {
      kind: 'project-asset',
      projectAssetId: `${name}-asset`,
    },
    {
      width: 1920,
      height: 1080,
      duration: type === VideoProjectAssetType.IMAGE ? null : 6,
      mimeType: 'video/mp4',
      size: 100,
      hasAudio,
      audioPeaks: hasAudio ? [0.1, 0.3, 0.5] : null,
    }
  );
}

describe('video editor project asset actions', () => {
  it('routes image and audio assets to their canonical tracks', verifyAssetTrackRouting);
  it(
    'creates grouped or ungrouped video clips based on asset audio metadata',
    verifyVideoAssetGrouping
  );
  it(
    'moves inserted clips to the end of occupied tracks instead of forcing overlap at the playhead',
    verifyOccupiedTrackInsertionFallback
  );
  it(
    'creates text, subtitle, and shape overlays on their canonical tracks',
    verifyOverlayInsertion
  );
  it('expands video blocks into normal project clips on canonical tracks', verifyBlockInsertion);
  it('creates annotation overlays on their canonical track', verifyAnnotationInsertion);
  it(
    'reuses an existing project asset entry instead of duplicating asset storage',
    verifyAssetDedup
  );
});

function verifyAssetTrackRouting(): void {
  vi.spyOn(Date, 'now').mockReturnValue(100);
  const project = createEmptyVideoProject('Assets');
  const imageResult = addAssetClipToProject(
    project,
    createAsset(VideoProjectAssetType.IMAGE, 'image-1'),
    null,
    2
  );
  const audioResult = addAssetClipToProject(
    project,
    createAsset(VideoProjectAssetType.AUDIO, 'audio-1'),
    null,
    3
  );

  expect(imageResult.project.clips[0]).toEqual(
    expect.objectContaining({
      trackId: imageResult.project.tracks.find((track) => track.kind === VideoTrackKind.OVERLAY)!
        .id,
      type: VideoProjectClipType.IMAGE,
    })
  );
  expect(audioResult.project.clips[0]).toEqual(
    expect.objectContaining({
      trackId: audioResult.project.tracks.find((track) => track.kind === VideoTrackKind.AUDIO)!.id,
      type: VideoProjectClipType.AUDIO,
    })
  );
  expect(imageResult.project.updatedAt).toBe(100);
  expect(audioResult.project.updatedAt).toBe(100);
}

function verifyVideoAssetGrouping(): void {
  vi.spyOn(Date, 'now').mockReturnValue(200);
  const project = createEmptyVideoProject('Assets');

  const groupedResult = addAssetClipToProject(
    project,
    createAsset(VideoProjectAssetType.VIDEO, 'video-audio', true),
    null,
    1
  );
  const plainResult = addAssetClipToProject(
    project,
    createAsset(VideoProjectAssetType.VIDEO, 'video-silent', false),
    null,
    1
  );

  expect(groupedResult.project.clips).toHaveLength(2);
  expect(groupedResult.project.clips.every((clip) => clip.groupId)).toBe(true);
  expect(plainResult.project.clips).toHaveLength(1);
  expect(plainResult.project.clips[0]?.groupId).toBeNull();
}

function verifyOverlayInsertion(): void {
  vi.spyOn(Date, 'now').mockReturnValue(300);
  const project = createEmptyVideoProject('Assets');

  const textResult = addTextOverlayToProject(project, null, 2);
  const subtitleResult = addSubtitleOverlayToProject(project, null, 2.5);
  const shapeResult = addShapeOverlayToProject(project, null, 3, VideoProjectShapeType.ELLIPSE);

  expect(textResult.project.clips[0]).toEqual(
    expect.objectContaining({
      trackId: textResult.selectedTrackId,
      type: VideoProjectClipType.TEXT,
    })
  );
  expect(shapeResult.project.clips[0]).toEqual(
    expect.objectContaining({
      shapeType: VideoProjectShapeType.ELLIPSE,
      trackId: shapeResult.selectedTrackId,
      type: VideoProjectClipType.SHAPE,
    })
  );
  expect(subtitleResult.project.clips[0]).toEqual(
    expect.objectContaining({
      text: expect.any(String),
      trackId: subtitleResult.selectedTrackId,
      type: VideoProjectClipType.SUBTITLE,
    })
  );
  expect(
    subtitleResult.project.tracks.find((track) => track.id === subtitleResult.selectedTrackId)?.kind
  ).toBe(VideoTrackKind.SUBTITLE);
}

function verifyAnnotationInsertion(): void {
  vi.spyOn(Date, 'now').mockReturnValue(220);
  const project = createEmptyVideoProject('Assets');
  const result = addAnnotationOverlayToProject(
    project,
    null,
    1.5,
    VideoOverlayTemplateKind.CALLOUT_CARD
  );

  expect(result.project.clips[0]).toEqual(
    expect.objectContaining({
      trackId: result.selectedTrackId,
      templateKind: VideoOverlayTemplateKind.CALLOUT_CARD,
      type: VideoProjectClipType.ANNOTATION,
    })
  );
  expect(result.project.tracks.find((track) => track.id === result.selectedTrackId)?.kind).toBe(
    VideoTrackKind.OVERLAY
  );
}

function verifyBlockInsertion(): void {
  vi.spyOn(Date, 'now').mockReturnValue(235);
  const project = createEmptyVideoProject('Blocks');

  const spotlightResult = addVideoBlockToProject(
    project,
    VideoBlockKind.FEATURE_SPOTLIGHT,
    null,
    2
  );
  const subtitleResult = addVideoBlockToProject(project, VideoBlockKind.KINETIC_CAPTIONS, null, 3);
  const chapterResult = addVideoBlockToProject(project, VideoBlockKind.CHAPTER_OPENER, null, 4);

  expect(spotlightResult.project.clips[0]).toEqual(
    expect.objectContaining({
      trackId: spotlightResult.selectedTrackId,
      type: VideoProjectClipType.ANNOTATION,
    })
  );
  expect(
    spotlightResult.project.tracks.find((track) => track.id === spotlightResult.selectedTrackId)
      ?.kind
  ).toBe(VideoTrackKind.OVERLAY);
  expect(subtitleResult.project.clips[0]).toEqual(
    expect.objectContaining({
      text: expect.any(String),
      trackId: subtitleResult.selectedTrackId,
      type: VideoProjectClipType.SUBTITLE,
    })
  );
  expect(
    subtitleResult.project.tracks.find((track) => track.id === subtitleResult.selectedTrackId)?.kind
  ).toBe(VideoTrackKind.SUBTITLE);
  expect(chapterResult.project.clips).toHaveLength(2);
  expect(
    chapterResult.project.clips.every((clip) => clip.type === VideoProjectClipType.ANNOTATION)
  ).toBe(true);
  expect(chapterResult.project.clips.every((clip) => clip.groupId)).toBe(true);
  expect(new Set(chapterResult.project.clips.map((clip) => clip.groupId)).size).toBe(1);
  expect(chapterResult.project.clips.every((clip) => clip.linkMode === 'LINKED')).toBe(true);
}

function verifyOccupiedTrackInsertionFallback(): void {
  vi.spyOn(Date, 'now').mockReturnValue(325);
  const project = createEmptyVideoProject('Assets');
  const groupedAsset = createAsset(VideoProjectAssetType.VIDEO, 'video-audio', true);

  const firstGroupedResult = addAssetClipToProject(project, groupedAsset, null, 1);
  const firstGroupedClipIds = new Set(firstGroupedResult.project.clips.map((clip) => clip.id));
  const secondGroupedResult = addAssetClipToProject(
    firstGroupedResult.project,
    createAsset(VideoProjectAssetType.VIDEO, 'video-audio-2', true),
    firstGroupedResult.selectedTrackId,
    1
  );
  const secondGroupedClips = secondGroupedResult.project.clips.filter(
    (clip) => !firstGroupedClipIds.has(clip.id)
  );
  const insertedGroupedStartTimes = new Set(secondGroupedClips.map((clip) => clip.startTime));

  const textResult = addTextOverlayToProject(project, null, 2);
  const shapeResult = addShapeOverlayToProject(
    textResult.project,
    textResult.selectedTrackId,
    2,
    VideoProjectShapeType.RECTANGLE
  );
  const insertedShapeClip = shapeResult.project.clips.find(
    (clip) => clip.type === VideoProjectClipType.SHAPE
  );
  const textTrackEnd = textResult.project.clips.reduce(
    (maxEnd, clip) => Math.max(maxEnd, clip.startTime + clip.duration),
    0
  );

  expect(insertedGroupedStartTimes).toEqual(new Set([7]));
  expect(insertedShapeClip?.startTime).toBe(textTrackEnd);
}

function verifyAssetDedup(): void {
  vi.spyOn(Date, 'now').mockReturnValue(350);
  const asset = createAsset(VideoProjectAssetType.VIDEO, 'video-audio', true);
  const project = {
    ...createEmptyVideoProject('Assets'),
    assets: [asset],
  };

  const result = addAssetClipToProject(project, asset, null, 1);

  expect(result.project.assets).toHaveLength(1);
  expect(result.project.assets[0]).toEqual(asset);
}
