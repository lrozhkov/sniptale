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
