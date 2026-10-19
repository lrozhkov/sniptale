import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { hydrateVideoProject } from '../hydration';
import { VideoProjectTrackRole } from '../types';
import { parseHydratableVideoProject } from './root';
import { isVideoProjectTrack } from './tracks';

it('accepts the explicit camera track role and rejects unknown persisted roles', () => {
  const track = createEmptyVideoProject('Camera role').tracks[0]!;

  expect(isVideoProjectTrack({ ...track, role: VideoProjectTrackRole.CAMERA })).toBe(true);
  expect(isVideoProjectTrack({ ...track, role: 'WEBCAM_GUESS' })).toBe(false);
  expect(isVideoProjectTrack({ ...track, kind: 'AUDIO', role: VideoProjectTrackRole.CAMERA })).toBe(
    false
  );
  expect(isVideoProjectTrack(track)).toBe(true);
});

it('keeps the camera role through the validated JSON hydration boundary', () => {
  const project = createEmptyVideoProject('Camera persistence');
  project.tracks[0] = { ...project.tracks[0]!, role: VideoProjectTrackRole.CAMERA };
  const parsed = parseHydratableVideoProject(JSON.parse(JSON.stringify(project)));

  expect(parsed).not.toBeNull();
  expect(hydrateVideoProject(parsed!).tracks[0]?.role).toBe(VideoProjectTrackRole.CAMERA);
});

it('admits only finite bounded AUDIO track masters', () => {
  const track = { ...createEmptyVideoProject('Master').tracks[0]!, kind: 'AUDIO' };
  for (const audioVolume of [0, 0.37, 1, 2])
    expect(isVideoProjectTrack({ ...track, audioVolume })).toBe(true);
  for (const audioVolume of [-1, 2.01, Infinity, NaN, '1', null])
    expect(isVideoProjectTrack({ ...track, audioVolume })).toBe(false);
  for (const kind of ['PRIMARY', 'SUBTITLE', 'unknown'])
    expect(isVideoProjectTrack({ ...track, kind, audioVolume: 1 })).toBe(false);
});
