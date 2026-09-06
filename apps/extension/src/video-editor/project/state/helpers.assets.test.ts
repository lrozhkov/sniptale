import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import {
  VideoTrackKind,
  VideoProjectAssetType,
  VideoProjectClipType,
} from '../../../features/video/project/types';
import { deleteProjectTrack } from './track/delete';

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

it('retains both placed and unplaced materials when their track is deleted', () => {
  const project = createEmptyVideoProject('Helpers');
  const track = createVideoProjectTrack('Video layer', 0, VideoTrackKind.OVERLAY);
  project.tracks.push(track);
  const primaryTrackId = track.id;

  project.assets = [createVideoAsset('asset-1', 'Kept'), createVideoAsset('asset-2', 'Removed')];
  project.clips = [createReferencedClip(primaryTrackId)];

  const nextProject = deleteProjectTrack(project, track.id);

  expect(nextProject.assets).toBe(project.assets);
  expect(nextProject.clips).toEqual([]);
  expect(deleteProjectTrack(nextProject, track.id)).toBe(nextProject);
});

it('retains embedded graphics as materials after deleting their overlay track', () => {
  const project = createEmptyVideoProject('Embedded assets');
  const overlayTrack = createVideoProjectTrack('Graphics', 0, VideoTrackKind.OVERLAY);
  project.tracks.push(overlayTrack);
  const overlayTrackId = overlayTrack.id;

  project.assets = [
    createVideoAsset('badge-asset', 'Kept badge'),
    createVideoAsset('orphan-asset', 'Removed'),
  ];
  project.clips = [createShapeClipWithEmbeddedAsset(overlayTrackId)];

  expect(deleteProjectTrack(project, overlayTrackId).assets).toBe(project.assets);
});
