import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createTextClip } from '../factories/overlay-clip';
import { VideoClipLinkMode } from '../types';
import { canSplitProjectClipAtTime } from './split-eligibility';

function createProject() {
  const project = createEmptyVideoProject('Split eligibility');
  const primary = createTextClip(project.tracks[0]!.id, project.width, project.height, 1);
  primary.id = 'primary';
  primary.duration = 4;
  project.duration = 5;
  project.clips = [primary];
  return project;
}

it('admits only interior cut points on editable clip tracks', () => {
  const project = createProject();

  expect(canSplitProjectClipAtTime(project, 'primary', 3)).toBe(true);
  expect(canSplitProjectClipAtTime(project, 'primary', 1.05)).toBe(false);
  expect(canSplitProjectClipAtTime(project, 'primary', 4.95)).toBe(false);
  expect(canSplitProjectClipAtTime(project, 'primary', 6)).toBe(false);

  project.tracks[0]!.locked = true;
  expect(canSplitProjectClipAtTime(project, 'primary', 3)).toBe(false);
});

it('requires the cut point to be valid for every linked counterpart', () => {
  const project = createProject();
  const primary = project.clips[0]!;
  primary.groupId = 'linked';
  primary.linkMode = VideoClipLinkMode.LINKED;
  const counterpart = {
    ...primary,
    id: 'counterpart',
    startTime: 2.98,
  };
  project.clips.push(counterpart);

  expect(canSplitProjectClipAtTime(project, 'primary', 3)).toBe(false);
  counterpart.startTime = 1;
  expect(canSplitProjectClipAtTime(project, 'primary', 3)).toBe(true);
});
