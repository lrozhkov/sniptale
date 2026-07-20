import { expect, it } from 'vitest';
import {
  VideoProjectAssetType,
  type VideoProject,
  type VideoProjectAsset,
} from '../video/project/public';
import { createVideoProjectEntryWithMediaClip } from '../../composition/persistence/projects/index.test-support';
import { createVideoProjectListItem } from './video-project-list-items';

function createAsset(
  type: VideoProjectAssetType,
  source: VideoProjectAsset['source']
): VideoProjectAsset {
  return {
    id: `asset-${type}`,
    type,
    name: `Asset ${type}`,
    source,
    metadata: {
      audioPeaks: null,
      duration: type === VideoProjectAssetType.IMAGE ? null : 4,
      hasAudio: type !== VideoProjectAssetType.IMAGE,
      height: 720,
      mimeType: type === VideoProjectAssetType.IMAGE ? 'image/png' : 'video/webm',
      size: 12,
      width: 1280,
    },
    createdAt: 1,
  };
}

function createProject(overrides: Partial<VideoProject> = {}): VideoProject {
  const project = createVideoProjectEntryWithMediaClip({
    height: 720,
    id: 'project-1',
    width: 1280,
  }).project;
  const firstClip = project.clips[0]!;
  return {
    ...project,
    clips: [firstClip, { ...firstClip, id: 'clip-2' }],
    tracks: project.tracks.slice(0, 1),
    ...overrides,
  };
}

it('creates compact project metadata for scalable library rows', () => {
  expect(createVideoProjectListItem(createProject())).toEqual(
    expect.objectContaining({
      clipCount: 2,
      height: 720,
      thumbnailId: 'video-project:project-1',
      thumbnailSourceMediaId: 'project-asset:project-asset-1',
      trackCount: 1,
      width: 1280,
    })
  );
});

it('uses the first visual source media id for project thumbnail generation', () => {
  const project = createProject({
    assets: [
      createAsset(VideoProjectAssetType.AUDIO, {
        kind: 'project-asset',
        projectAssetId: 'audio-1',
      }),
      createAsset(VideoProjectAssetType.VIDEO, {
        kind: 'recording',
        recordingId: 'recording-1',
      }),
    ],
  });

  expect(createVideoProjectListItem(project).thumbnailSourceMediaId).toBe('recording:recording-1');
});

it('supports project-owned visual assets and ignores unsupported visual sources', () => {
  const projectAssetProject = createProject({
    assets: [
      createAsset(VideoProjectAssetType.IMAGE, {
        kind: 'project-asset',
        projectAssetId: 'image-1',
      }),
    ],
  });
  const scenarioProject = createProject({
    assets: [
      createAsset(VideoProjectAssetType.IMAGE, {
        kind: 'scenario-asset',
        scenarioAssetId: 'scenario-1',
      }),
    ],
  });

  expect(createVideoProjectListItem(projectAssetProject).thumbnailSourceMediaId).toBe(
    'project-asset:image-1'
  );
  expect(createVideoProjectListItem(scenarioProject).thumbnailSourceMediaId).toBeNull();
});
