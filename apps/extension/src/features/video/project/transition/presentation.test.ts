import { expect, it } from 'vitest';
import { syncProjectTransitions } from './project';
import { createGlTransitionSelection } from './gl-catalog';
import { resolveClipTransitionAudioMultiplier } from './presentation';
import { getClipCompositeAudioGain, getClipCompositeVisualOpacity } from '../timeline/presentation';
import {
  createProject,
  createVideoClip,
  createAudioClip,
  createTrack,
} from '../timeline/project-meta.test.helpers';

it.each(['Fade', 'Directional', 'CrossZoom'])(
  'keeps source opacity and geometry independent of the %s composite while retaining audio weights',
  (name) => {
    const a = createVideoClip({ id: 'A', trackId: 'video', startTime: 0, duration: 4 });
    const b = createVideoClip({ id: 'B', trackId: 'video', startTime: 3, duration: 4 });
    const project = createProject([a, b], [createTrack('video', 0)]);
    project.transitions = [
      {
        id: 'AB',
        leadingClipId: 'A',
        trailingClipId: 'B',
        kind: 'gl',
        selection: createGlTransitionSelection(name)!,
        duration: 1,
        easing: 'LINEAR',
      },
    ];
    const original = structuredClone(project);
    for (const time of [3.25, 3.5, 3.75]) {
      expect(getClipCompositeVisualOpacity(project, a, time)).toBe(a.transform.opacity);
      expect(getClipCompositeVisualOpacity(project, b, time)).toBe(b.transform.opacity);
      expect(resolveClipTransitionAudioMultiplier(project, a, time)).toBeCloseTo(4 - time);
      expect(resolveClipTransitionAudioMultiplier(project, b, time)).toBeCloseTo(time - 3);
    }
    expect(project).toEqual(original);
  }
);

it('applies authored source fades once rather than a second visual junction fade', () => {
  const a = createVideoClip({ id: 'A', trackId: 'video', startTime: 0, duration: 4 });
  const b = createVideoClip({
    id: 'B',
    trackId: 'video',
    startTime: 3,
    duration: 4,
    fadeInMs: 1000,
    transform: { ...a.transform, opacity: 0.4 },
  });
  const project = syncProjectTransitions(createProject([a, b], [createTrack('video', 0)]));
  expect(getClipCompositeVisualOpacity(project, b, 3.5)).toBeCloseTo(0.2);
});

it('creates an audio boundary with complementary gains without a visual implementation', () => {
  const a = createAudioClip({ id: 'A', trackId: 'audio', startTime: 0, duration: 4 });
  const b = createAudioClip({ id: 'B', trackId: 'audio', startTime: 3, duration: 4 });
  const project = syncProjectTransitions(createProject([a, b], [createTrack('audio', 0, 'AUDIO')]));
  expect(project.transitions).toHaveLength(1);
  expect(project.transitions![0]).toMatchObject({ kind: 'audio' });
  expect(project.transitions![0]).not.toHaveProperty('selection');
  for (const time of [3, 3.25, 3.5, 3.75]) {
    const outgoing = getClipCompositeAudioGain(project, project.clips[0]!, time);
    const incoming = getClipCompositeAudioGain(project, project.clips[1]!, time);
    expect(outgoing).toBeCloseTo(4 - time);
    expect(incoming).toBeCloseTo(time - 3);
    expect(outgoing + incoming).toBeCloseTo(1);
  }
});
