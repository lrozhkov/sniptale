import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType, VideoProjectClipType } from '../../../features/video/project/types';
import { pruneUnusedProjectAssets } from './helpers';

function createVideoAsset(id: string, name: string) {
  return {
    createdAt: 1,
    id,
    metadata: {
      audioPeaks: null,
      duration: 4,
      hasAudio: id === 'asset-1',
      height: 1080,
      mimeType: 'video/mp4',
      size: 100,
      width: 1920,
    },
    name,
    source: { kind: 'project-asset' as const, projectAssetId: id },
    type: VideoProjectAssetType.VIDEO,
  };
}

function createReferencedClip(trackId: string) {
  return {
    id: 'clip-1',
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: 'Clip 1',
    groupId: null,
    linkMode: 'DETACHED',
    startTime: 0,
    duration: 4,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    fitMode: 'CONTAIN',
    sourceStart: 0,
    sourceDuration: 4,
  } as never;
}

function createShapeClipWithEmbeddedAsset(trackId: string) {
  return {
    duration: 4,
    embeddedAsset: {
      assetId: 'badge-asset',
      placement: { height: 20, width: 20, x: 4, y: 4 },
    },
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'shape-1',
    linkMode: 'DETACHED',
    muted: true,
    name: 'Shape 1',
    shapeType: 'RECTANGLE',
    startTime: 0,
    style: { borderRadius: 8, fillColor: '#fff', strokeColor: '#000', strokeWidth: 1 },
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    type: VideoProjectClipType.SHAPE,
    volume: 1,
  } as never;
}

it('prunes orphaned assets that are no longer referenced by project clips', () => {
  const project = createEmptyVideoProject('Helpers');
  const primaryTrackId = project.tracks[0]!.id;

  project.assets = [createVideoAsset('asset-1', 'Kept'), createVideoAsset('asset-2', 'Removed')];
  project.clips = [createReferencedClip(primaryTrackId)];

  const nextProject = pruneUnusedProjectAssets(project);

  expect(nextProject.assets).toEqual([
    expect.objectContaining({
      id: 'asset-1',
    }),
  ]);
  expect(pruneUnusedProjectAssets(nextProject)).toBe(nextProject);
});

it('keeps assets referenced by embedded shape template graphics', () => {
  const project = createEmptyVideoProject('Embedded assets');
  const overlayTrackId = project.tracks[2]!.id;

  project.assets = [
    createVideoAsset('badge-asset', 'Kept badge'),
    createVideoAsset('orphan-asset', 'Removed'),
  ];
  project.clips = [createShapeClipWithEmbeddedAsset(overlayTrackId)];

  expect(pruneUnusedProjectAssets(project).assets).toEqual([
    expect.objectContaining({ id: 'badge-asset' }),
  ]);
});
