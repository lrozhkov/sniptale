import { expect, it } from 'vitest';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoExportScope,
  VideoTimelinePlacementMode,
} from '../../../features/video/project/types/index';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../features/video/project/types/index';
import { isVideoProject, isVideoProjectExportSettings } from './validators';

function createVideoProject() {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 10,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
    cursorTrack: null,
    actionEvents: [],
  };
}

function createReferencedVideoProject() {
  const project = createEmptyVideoProject('Project', 1280, 720);
  const asset = createVideoProjectAsset(
    'Clip',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    {
      audioPeaks: null,
      duration: 5,
      hasAudio: true,
      height: 720,
      mimeType: 'video/webm',
      size: 100,
      width: 1280,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720);

  return { ...project, assets: [asset], clips: [clip], duration: clip.duration };
}

function createExportSettings() {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
  };
}

it('validates video project export project payloads', () => {
  expect(isVideoProject(createVideoProject())).toBe(true);
  expect(isVideoProject({ ...createVideoProject(), clips: 'bad-clips' })).toBe(false);
  expect(isVideoProject({ ...createVideoProject(), source: null })).toBe(false);
  const referencedProject = createReferencedVideoProject();
  expect(isVideoProject(referencedProject)).toBe(true);
  expect(
    isVideoProject({
      ...referencedProject,
      clips: [{ ...referencedProject.clips[0]!, assetId: 'missing-asset' }],
    })
  ).toBe(false);
});

it('validates video project export settings payloads', () => {
  expect(isVideoProjectExportSettings(createExportSettings())).toBe(true);
  expect(isVideoProjectExportSettings({ ...createExportSettings(), format: 'mp4' })).toBe(false);
  expect(isVideoProjectExportSettings({ ...createExportSettings(), width: 0 })).toBe(false);
  expect(isVideoProjectExportSettings({ ...createExportSettings(), height: -1 })).toBe(false);
  expect(isVideoProjectExportSettings({ ...createExportSettings(), width: 8000 })).toBe(false);
  expect(isVideoProjectExportSettings({ ...createExportSettings(), fps: 0 })).toBe(false);
  expect(isVideoProjectExportSettings({ ...createExportSettings(), fps: 240 })).toBe(false);
  expect(
    isVideoProjectExportSettings({
      ...createExportSettings(),
      rangeStartSeconds: -1,
    })
  ).toBe(false);
  expect(
    isVideoProjectExportSettings({
      ...createExportSettings(),
      rangeStartSeconds: 5,
      rangeEndSeconds: 4,
    })
  ).toBe(false);
  expect(
    isVideoProjectExportSettings({
      ...createExportSettings(),
      scope: VideoExportScope.SELECTED_CLIP,
      selectedClipIds: [],
    })
  ).toBe(false);
  expect(
    isVideoProjectExportSettings({
      ...createExportSettings(),
      selectedClipIds: ['clip-1', 2],
    })
  ).toBe(false);
  expect(
    isVideoProjectExportSettings({
      ...createExportSettings(),
      subtitleSidecarFormats: ['docx'],
    })
  ).toBe(false);
});
