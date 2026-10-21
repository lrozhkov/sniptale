import { expect, it } from 'vitest';
import {
  constrainPresentationEnvelope,
  createPresentationFade,
  createVideoProjectSceneEdges,
  getVideoProjectSceneEdgeAudioGain,
  parsePresentationFade,
  parseVideoProjectSceneEdges,
  presentationEnvelopeOpacity,
  resolveVideoProjectSceneEdgePlan,
} from './edge-fades';

it('retains neutral omission and independent remembered values without a source write', () => {
  const project = { duration: 10 };
  expect(createPresentationFade()).toEqual({ enabled: false, duration: 0.4 });
  const settings = createVideoProjectSceneEdges();
  expect(settings.intro).not.toBe(settings.outro);
  settings.intro.duration = 4;
  expect(settings.outro.duration).toBe(0.4);
  expect(getVideoProjectSceneEdgeAudioGain(project, 0)).toBe(1);
  expect(
    presentationEnvelopeOpacity(resolveVideoProjectSceneEdgePlan(project).visualEnvelope, 0)
  ).toBe(0);
  expect(project).toEqual({ duration: 10 });
});

it('shares strict scalar admission without materializing inherited fallback values', () => {
  expect(parsePresentationFade({ enabled: false, duration: 60 })).toEqual({
    enabled: false,
    duration: 60,
  });
  expect(
    parsePresentationFade({ enabled: true, duration: 0, color: '#123', audioFade: true })
  ).toEqual({ enabled: true, duration: 0, color: '#112233ff', audioFade: true });
  for (const patch of [
    { enabled: 1 },
    { duration: -1 },
    { duration: 60.1 },
    { duration: NaN },
    { duration: Infinity },
    { color: '#00000080' },
    { color: 'none' },
    { color: 0 },
    { audioFade: 1 },
    { unknown: true },
  ])
    expect(parsePresentationFade({ enabled: true, duration: 1, ...patch })).toBeNull();
  for (const value of [null, [], {}, 'fade']) expect(parsePresentationFade(value)).toBeNull();
  const settings = createVideoProjectSceneEdges();
  expect(parseVideoProjectSceneEdges(settings)).toEqual(settings);
  for (const value of [
    null,
    [],
    {},
    { intro: settings.intro },
    { ...settings, extra: 1 },
    { ...settings, outro: { enabled: false, duration: 61 } },
  ])
    expect(parseVideoProjectSceneEdges(value)).toBeNull();
});

it('limits visual edges proportionally before masking independent audio switches', () => {
  const sceneEdges = {
    intro: { enabled: true, duration: 2, color: '#ff0000ff', audioFade: true },
    outro: { enabled: true, duration: 2, color: '#0000ffff', audioFade: false },
  };
  const project = { duration: 2, sceneEdges };
  const before = structuredClone(sceneEdges);
  const plan = resolveVideoProjectSceneEdgePlan(project);
  expect(plan.visualEnvelope).toEqual({ span: 2, fadeIn: 1, fadeOut: 1 });
  expect(plan.audioEnvelope).toEqual({ span: 2, fadeIn: 1, fadeOut: 0 });
  expect(plan.color).toBe('#ff0000ff');
  expect(plan.endColor).toBe('#0000ffff');
  expect(getVideoProjectSceneEdgeAudioGain(project, 0.5)).toBe(0.5);
  expect(getVideoProjectSceneEdgeAudioGain(project, 1.5)).toBe(1);
  expect(sceneEdges).toEqual(before);
  expect(resolveVideoProjectSceneEdgePlan({ ...project, duration: 10 }).visualEnvelope).toEqual({
    span: 10,
    fadeIn: 2,
    fadeOut: 2,
  });
});

it('keeps disabled remembered fades neutral and evaluates absolute composition time', () => {
  const sceneEdges = {
    intro: { enabled: true, duration: 2, audioFade: true },
    outro: { enabled: true, duration: 4, audioFade: true },
  };
  const project = { duration: 10, sceneEdges };
  const plan = resolveVideoProjectSceneEdgePlan(project);
  for (const [time, expected] of [
    [-1, 1],
    [0, 1],
    [1, 0.5],
    [2, 0],
    [6, 0],
    [8, 0.5],
    [10, 1],
    [11, 1],
  ])
    expect(presentationEnvelopeOpacity(plan.visualEnvelope, time!)).toBe(expected);
  expect(getVideoProjectSceneEdgeAudioGain(project, 8)).toBe(0.5);
  const disabled = {
    ...project,
    sceneEdges: { ...sceneEdges, outro: { ...sceneEdges.outro, enabled: false } },
  };
  expect(getVideoProjectSceneEdgeAudioGain(disabled, 10)).toBe(1);
  expect(disabled.sceneEdges.outro.duration).toBe(4);
  expect(constrainPresentationEnvelope(0, 0, 0)).toEqual({ span: 0, fadeIn: 0, fadeOut: 0 });
  expect(() => presentationEnvelopeOpacity(plan.visualEnvelope, NaN)).toThrow(
    'Invalid presentation'
  );
});
