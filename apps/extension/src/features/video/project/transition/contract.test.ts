import { createProject, createVideoClip, createTrack } from '../timeline/project-meta.test.helpers';
import { hasValidVideoProjectTransitionReferences } from './contract';
import { expect, it } from 'vitest';
import { createDefaultVideoProjectTransition, parseVideoProjectTransition } from './contract';

const boundary = {
  id: 'AB',
  leadingClipId: 'A',
  trailingClipId: 'B',
  duration: 1,
  easing: 'LINEAR' as const,
};

it('authors complete pinned visual boundaries and independent audio boundaries', () => {
  const visual = createDefaultVideoProjectTransition(boundary, false);
  expect(visual.kind).toBe('gl');
  if (visual.kind !== 'gl') throw new Error('Expected visual boundary.');
  expect(visual.selection.name).toBe('Fade');
  expect(parseVideoProjectTransition(visual)).toEqual(visual);
  expect(createDefaultVideoProjectTransition(boundary, true)).toEqual({
    ...boundary,
    kind: 'audio',
  });
  expect(parseVideoProjectTransition({ ...boundary, kind: 'audio' })).toEqual({
    ...boundary,
    kind: 'audio',
  });
});

it('refuses legacy styles, unknown implementations and executable or ambiguous extra fields', () => {
  const visual = createDefaultVideoProjectTransition(boundary, false);
  if (visual.kind !== 'gl') throw new Error('Expected visual boundary.');
  for (const value of [
    { ...boundary, kind: 'CROSSFADE' },
    { ...visual, templateKind: 'CROSSFADE' },
    { ...visual, renderKind: 'SHADER' },
    { ...visual, source: 'shader payload' },
    { ...visual, selection: { ...visual.selection, wgslSha256: '0'.repeat(64) } },
    { ...visual, selection: { ...visual.selection, values: { foreign: 1 } } },
    { ...boundary, kind: 'gl' },
    { ...boundary, kind: 'audio', selection: visual.selection },
    { ...visual, trailingClipId: 'A' },
    { ...visual, duration: Infinity },
  ])
    expect(parseVideoProjectTransition(value)).toBeNull();
});

it('takes an independent accepted snapshot without rewriting the original source', () => {
  const visual = createDefaultVideoProjectTransition(boundary, false);
  const snapshot = structuredClone(visual);
  const parsed = parseVideoProjectTransition({ ...visual, presetId: 'local-style' });
  expect(parsed).toEqual({ ...visual, presetId: 'local-style' });
  expect(visual).toEqual(snapshot);
  expect(parsed).not.toBe(visual);
  if (parsed?.kind !== 'gl' || visual.kind !== 'gl') throw new Error('Expected visual boundaries.');
  parsed.selection.values['foreign'] = 1;
  expect(visual).toEqual(snapshot);
});

it('admits only actual same-lane visual boundaries and refuses duplicates and audio-domain mismatches', () => {
  const project = createProject(
    [
      createVideoClip({ id: 'A', trackId: 'video', startTime: 0, duration: 5 }),
      createVideoClip({ id: 'B', trackId: 'video', startTime: 4, duration: 5 }),
    ],
    [createTrack('video', 0), createTrack('other', 1)]
  );
  const visual = createDefaultVideoProjectTransition({ ...boundary, duration: 1 }, false);
  project.transitions = [visual];
  expect(hasValidVideoProjectTransitionReferences(project)).toBe(true);
  const snapshot = structuredClone(project);
  project.transitions = [createDefaultVideoProjectTransition(boundary, true)];
  expect(hasValidVideoProjectTransitionReferences(project)).toBe(false);
  project.transitions = [visual, { ...visual, id: 'duplicate-pair' }];
  expect(hasValidVideoProjectTransitionReferences(project)).toBe(false);
  project.transitions = [visual];
  project.clips = project.clips.map((clip) =>
    clip.id === 'B' ? { ...clip, trackId: 'other' } : clip
  );
  expect(hasValidVideoProjectTransitionReferences(project)).toBe(false);
  project.clips = snapshot.clips.map((clip) =>
    clip.id === 'B' ? { ...clip, timelineLaneId: 'other-lane' } : clip
  );
  expect(hasValidVideoProjectTransitionReferences(project)).toBe(false);
  project.clips = snapshot.clips.map((clip) =>
    clip.id === 'B' ? { ...clip, startTime: 6 } : clip
  );
  expect(hasValidVideoProjectTransitionReferences(project)).toBe(false);
  expect(snapshot.transitions).toEqual([visual]);
});
