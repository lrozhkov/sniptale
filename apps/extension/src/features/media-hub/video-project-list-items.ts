import {
  VideoProjectAssetType,
  type VideoProject,
  type VideoProjectAsset,
} from '../video/project/public';
import { createProjectAssetMediaId, createRecordingMediaId } from './media-id';

export interface VideoProjectListItem extends Pick<
  VideoProject,
  'createdAt' | 'duration' | 'height' | 'id' | 'name' | 'updatedAt' | 'width'
> {
  clipCount: number;
  thumbnailId: string;
  thumbnailSourceMediaId: string | null;
  trackCount: number;
  unavailableReason?: 'invalid' | 'unsupported-engine1';
}

export function createInvalidVideoProjectListItem(id: string): VideoProjectListItem {
  return {
    clipCount: 0,
    createdAt: 0,
    duration: 0,
    height: 0,
    id,
    name: id,
    thumbnailId: createProjectThumbnailId(id),
    thumbnailSourceMediaId: null,
    trackCount: 0,
    unavailableReason: 'invalid',
    updatedAt: 0,
    width: 0,
  };
}

export function createUnsupportedVideoProjectListItem(metadata: {
  createdAt: number;
  duration: number;
  height: number;
  id: string;
  name: string;
  updatedAt: number;
  width: number;
}): VideoProjectListItem {
  return {
    ...metadata,
    clipCount: 0,
    thumbnailId: createProjectThumbnailId(metadata.id),
    thumbnailSourceMediaId: null,
    trackCount: 0,
    unavailableReason: 'unsupported-engine1',
  };
}

function createProjectThumbnailId(projectId: string): string {
  return `video-project:${projectId}`;
}

function isVisualProjectAsset(asset: VideoProjectAsset): boolean {
  return (
    asset.type === VideoProjectAssetType.RECORDING ||
    asset.type === VideoProjectAssetType.VIDEO ||
    asset.type === VideoProjectAssetType.IMAGE
  );
}

function resolveProjectAssetMediaId(asset: VideoProjectAsset): string | null {
  if (!isVisualProjectAsset(asset)) {
    return null;
  }

  if (asset.source.kind === 'recording') {
    return createRecordingMediaId(asset.source.recordingId);
  }

  if (asset.source.kind === 'project-asset') {
    return createProjectAssetMediaId(asset.source.projectAssetId);
  }

  return null;
}

function resolveProjectThumbnailSourceMediaId(project: VideoProject): string | null {
  for (const asset of project.assets) {
    const sourceMediaId = resolveProjectAssetMediaId(asset);
    if (sourceMediaId) {
      return sourceMediaId;
    }
  }

  return null;
}

export function createVideoProjectListItem(project: VideoProject): VideoProjectListItem {
  return {
    id: project.id,
    name: project.name,
    duration: project.duration,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    width: project.width,
    height: project.height,
    clipCount: project.clips.length,
    trackCount: project.tracks.length,
    thumbnailId: createProjectThumbnailId(project.id),
    thumbnailSourceMediaId: resolveProjectThumbnailSourceMediaId(project),
  };
}
