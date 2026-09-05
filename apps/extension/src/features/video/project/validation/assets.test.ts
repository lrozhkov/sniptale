import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../factories/creation';
import { hydrateVideoProject } from '../hydration';
import { VideoProjectTrackRole } from '../types';
import { isVideoProjectAsset } from './assets';
import { parseHydratableVideoProject } from './root';

function recording() {
  return createVideoProjectFromRecording({
    recordingId: 'screen',
    filename: 'screen.webm',
    width: 1280,
    height: 720,
    duration: 6,
    mimeType: 'video/webm',
    size: 100,
    sidecarVideos: [
      {
        recordingId: 'camera',
        filename: 'camera.webm',
        width: 640,
        height: 480,
        duration: 9,
        mimeType: 'video/webm',
        size: 100,
        trackRole: VideoProjectTrackRole.CAMERA,
      },
    ],
  });
}

it('retains recording source membership through project serialization and hydration', () => {
  const project = recording();
  const parsed = parseHydratableVideoProject(JSON.parse(JSON.stringify(project)));
  expect(parsed).not.toBeNull();
  if (!parsed) throw new Error('Project rejected');
  const restored = hydrateVideoProject(parsed);
  expect(restored.assets).toEqual(project.assets);
  expect(restored.clips).toMatchObject(project.clips);
  expect(restored.duration).toBe(6);
});

it.each([
  null,
  {},
  { recordingId: '', role: 'primary' },
  { recordingId: 42, role: 'camera' },
  { recordingId: 'screen', role: 'unknown' },
  { recordingId: 'screen', role: 'audio' },
])('rejects malformed or mismatched recording membership %j', (recordingPart) => {
  const project = recording();
  const asset = { ...project.assets[0], recordingPart };
  expect(isVideoProjectAsset(asset)).toBe(false);
  expect(parseHydratableVideoProject({ ...project, assets: [asset] })).toBeNull();
});

it('retains membership when media has been materialized into a project asset', () => {
  const asset = {
    ...recording().assets[0],
    source: {
      kind: 'project-asset',
      projectAssetId: 'stored-screen',
      originRecordingId: 'screen',
    },
  };
  expect(isVideoProjectAsset(asset)).toBe(true);
  expect(isVideoProjectAsset({ ...asset, type: 'IMAGE' })).toBe(false);
  expect(
    isVideoProjectAsset({
      ...asset,
      type: 'AUDIO',
      recordingPart: { recordingId: 'screen', role: 'audio' },
    })
  ).toBe(true);
});
