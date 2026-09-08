import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { createVideoClip } from '../../../features/video/project/timeline/project-meta.test.helpers';
import { isAudioRecordingRangeAvailable } from './timeline-gaps';

it('admits only wholly free audio ranges, including empty tracks and touching boundaries', () => {
  const project = createEmptyVideoProject('Voice');
  const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
  project.tracks.push(track);
  project.duration = 12;
  expect(isAudioRecordingRangeAvailable(project, track.id, 2, 5)).toBe(true);
  project.clips = [createVideoClip({ trackId: track.id, startTime: 5, duration: 2 })];
  expect(isAudioRecordingRangeAvailable(project, track.id, 2, 5)).toBe(true);
  expect(isAudioRecordingRangeAvailable(project, track.id, 7, 10)).toBe(true);
  for (const [start, end] of [
    [4, 8],
    [0, 12],
    [2, 2.9],
    [-1, 4],
    [10, 13],
    [NaN, 4],
  ]) {
    expect(isAudioRecordingRangeAvailable(project, track.id, start!, end!)).toBe(false);
  }
  expect(isAudioRecordingRangeAvailable(project, track.id, 2, 3)).toBe(true);
  track.locked = true;
  expect(isAudioRecordingRangeAvailable(project, track.id, 2, 5)).toBe(false);
  expect(isAudioRecordingRangeAvailable(project, 'missing', 2, 5)).toBe(false);
});
