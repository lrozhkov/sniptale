import { expect, it } from 'vitest';
import { normalizeVideoProjectCursorSkin } from '../project/cursor';
import {
  authoredCursorFocusPath,
  insertCursorFocusKey,
  updateCursorFocusKey,
} from '../project/cursor-focus-path/authoring';
import { resolveProjectCursorFocus } from '../project/cursor-focus-path/projection';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { hydrateVideoProject } from '../project/hydration';
import type { VideoProject } from '../project/types';
import { isExportReadyVideoProject, parseHydratableVideoProject } from '../project/validation/root';
import {
  resolveObservedCursorPosition,
  resolveVideoCompositionCursor,
} from '../composition/timeline/frame/cursor';
import {
  deriveReviewCursorFocusPath,
  evaluateReviewCursorFocus,
  resolveReviewCursorFocusPath,
  type ReviewCursorFacts,
} from './advanced/cursor-focus-path';
import { planReviewProjectConversion } from './project-conversion';
import { fixture } from './project-conversion.test-support';

function cursorFixture() {
  const input = fixture();
  input.document.edits = [
    { id: 'cut', kind: 'cut', start: 1, end: 3, requestedStart: 1, requestedEnd: 3 },
    {
      id: 'speed',
      kind: 'speed',
      start: 3,
      end: 4,
      requestedStart: 3,
      requestedEnd: 4,
      rate: 2,
      audio: 'speed',
    },
  ];
  const facts: ReviewCursorFacts = {
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: { ...normalizeVideoProjectCursorSkin(undefined), hidden: true },
      samples: [
        { id: 'start', time: 0, x: 0.1, y: 0.2, visible: true },
        { id: 'removed-curve-key', time: 2, x: 0.8, y: 0.7, visible: true },
        { id: 'curve-end', time: 4, x: 0.2, y: 0.3, visible: true },
        { id: 'before-gap', time: 5, x: 0.3, y: 0.4, visible: true },
        { id: 'outside', time: 5.5, x: 0.3, y: 0.4, visible: false },
        { id: 'return', time: 6, x: 0.7, y: 0.6, visible: true },
        { id: 'end', time: 7, x: 0.9, y: 0.8, visible: true },
      ].map((sample) => ({
        ...sample,
        observation: sample.visible ? ('observed' as const) : ('outside' as const),
        captureSegment: sample.time >= 6 ? 1 : 0,
        observationClockId: sample.time >= 6 ? 'clock:1' : 'clock:0',
        recordingPoint: sample.visible ? { x: sample.x, y: sample.y } : null,
        x: sample.x * input.source.width,
        y: sample.y * input.source.height,
      })),
    },
    actionEvents: [],
    signals: [],
  };
  let path = deriveReviewCursorFocusPath(facts, input.source);
  const segment = path.segments[0]!;
  path = insertCursorFocusKey(path, segment.id, {
    id: 'manual-focus',
    time: 3.25,
    x: 0.65,
    y: 0.35,
  });
  path = updateCursorFocusKey(path, 'manual-focus', {
    incoming: { x: 0.55, y: 0.25 },
    outgoing: { x: 0.75, y: 0.45 },
  });
  return {
    input,
    facts,
    authored: { ...authoredCursorFocusPath(path), mode: 'follow' as const },
  };
}

function convertedCursorProject(): ReturnType<typeof cursorFixture> & { project: VideoProject } {
  const value = cursorFixture();
  value.input.seed = createVideoProjectFromRecording({
    ...value.input.source,
    recordingId: 'recording',
    filename: 'Cursor.webm',
    cursorTrack: value.facts.cursorTrack,
    hasAudio: true,
  });
  value.input.seed.id = 'conversion-1';
  value.input.document.advancedContent.cursorFocusPath = value.authored;
  const before = structuredClone(value.input);
  const plan = planReviewProjectConversion(value.input);
  expect(plan.status).toBe('prepared');
  expect(value.input).toEqual(before);
  if (plan.status !== 'prepared') throw new Error('Cursor transfer must be admitted');
  expect(isExportReadyVideoProject(plan.project)).toBe(true);
  return { ...value, project: hydrateVideoProject(structuredClone(plan.project)) };
}

it.each([0.5, 3.1, 3.25, 4.25, 5.75, 6.25])(
  'preserves Gallery focus at source second %s after cuts, speed and reopen',
  (sourceTime) => {
    const { input, facts, authored, project } = convertedCursorProject();
    const clip = project.clips.find(
      (clip) =>
        clip.type === 'VIDEO' &&
        sourceTime >= clip.sourceStart &&
        sourceTime < clip.sourceStart + clip.sourceDuration
    );
    if (clip?.type !== 'VIDEO') throw new Error('Expected retained source time');
    const time = clip.startTime + (sourceTime - clip.sourceStart) / (clip.playbackRate ?? 1);
    const expected = evaluateReviewCursorFocus(
      resolveReviewCursorFocusPath(facts, input.source, authored),
      sourceTime
    );
    const actual = resolveProjectCursorFocus(project, time, undefined, clip.id);
    if (!expected) {
      expect(actual).toBeNull();
      return;
    }
    expect(actual).not.toBeNull();
    expect(actual!.x / project.width).toBeCloseTo(expected.x, 7);
    expect(actual!.y / project.height).toBeCloseTo(expected.y, 7);
  }
);

it('preserves the actual linear observation at a cut edge between sparse captured samples', () => {
  const { input, facts, project } = convertedCursorProject();
  const expected = evaluateReviewCursorFocus(
    deriveReviewCursorFocusPath(facts, input.source, true),
    0.5
  )!;
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const actual = resolveObservedCursorPosition(project, 0.5, clip.id)!;
  expect(actual.recordingPoint?.x).toBeCloseTo(expected.x, 7);
  expect(actual.recordingPoint?.y).toBeCloseTo(expected.y, 7);
});

it('retains all original observations and sparse source-bound authoring without painting a new cursor', () => {
  const { input, facts, authored, project } = convertedCursorProject();
  const group = project.cursorTrack?.sourceObservations?.[0];
  expect(project.version).toBe(33);
  expect(group).toMatchObject({
    recordingId: 'recording',
    sourceInstanceId: 'conversion-1:source',
  });
  expect(group?.samples).toEqual(facts.cursorTrack!.samples);
  expect(group?.samples.some((sample) => sample.time === 2)).toBe(true);
  expect(group?.samples.every((sample) => !sample.sourceAnchor && !sample.timeBasis)).toBe(true);
  expect(project.cursorFocusPath?.segments[0]).toMatchObject({
    binding: {
      kind: 'recording-source',
      recordingId: 'recording',
      sourceInstanceId: 'conversion-1:source',
    },
    start: authored.segments[0]!.start,
    end: authored.segments[0]!.end,
    keys: authored.segments[0]!.keys,
  });
  expect(project.cursorTrack?.skin).toEqual({ ...facts.cursorTrack!.skin, hidden: true });
  expect(resolveVideoCompositionCursor(project, 0.5, [])).toBeNull();
  expect(input.document.advancedContent.cursorFocusPath).toEqual(authored);
});

it('keeps focus bound to its original instance when another use of the same source overlaps it', () => {
  const { project } = convertedCursorProject();
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (clip.type !== 'VIDEO') throw new Error('Expected original video');
  project.clips.push({
    ...structuredClone(clip),
    id: 'other-instance-clip',
    sourceInstanceId: 'other-instance',
  });
  expect(isExportReadyVideoProject(project)).toBe(true);
  expect(resolveProjectCursorFocus(project, 0.5, undefined, 'other-instance-clip')).toBeNull();
  expect(resolveProjectCursorFocus(project, 0.5, undefined, clip.id)).not.toBeNull();
});

it.each(['project-clock', 'easing', 'skin', 'duplicate-id'] as const)(
  'refuses %s Native cursor authoring instead of treating it as neutral captured facts',
  (kind) => {
    const { input } = convertedCursorProject();
    const before = structuredClone(input);
    const sample = input.seed.cursorTrack!.samples[0]!;
    if (kind === 'project-clock') {
      delete sample.sourceAnchor;
      sample.timeBasis = 'project';
    } else if (kind === 'easing') sample.interpolation = 'EASE_OUT';
    else if (kind === 'skin')
      sample.skinOverride = { ...input.seed.cursorTrack!.skin, color: '#ff0000' };
    else input.seed.cursorTrack!.samples[1]!.id = sample.id;
    const authored = structuredClone(input);
    expect(planReviewProjectConversion(input).status).toBe('blocked');
    expect(input).toEqual(authored);
    expect(input.seed.cursorTrack).not.toEqual(before.seed.cursorTrack);
  }
);

it.each(['removed-curve-key', 'end:segment:return'])(
  'retains authored controls for captured key %s with source-instance identity',
  (id) => {
    const value = cursorFixture();
    const resolved = resolveReviewCursorFocusPath(value.facts, value.input.source, value.authored);
    const edited = updateCursorFocusKey(resolved, id, {
      interpolation: 'linear',
      outgoing: { x: 0.6, y: 0.55 },
    });
    value.input.seed = createVideoProjectFromRecording({
      ...value.input.source,
      recordingId: 'recording',
      filename: 'Cursor.webm',
      cursorTrack: value.facts.cursorTrack,
      hasAudio: true,
    });
    value.input.seed.id = 'conversion-1';
    value.input.document.advancedContent.cursorFocusPath = authoredCursorFocusPath(edited);
    const plan = planReviewProjectConversion(value.input);
    if (plan.status !== 'prepared') throw new Error('Expected captured control transfer');
    const expectedId =
      id === 'removed-curve-key'
        ? 'conversion-1:source:removed-curve-key'
        : 'end:segment:conversion-1:source:return';
    expect(
      plan.project.cursorFocusPath?.segments.flatMap((segment) => segment.keys)
    ).toContainEqual(
      expect.objectContaining({ id: expectedId, outgoing: { x: 0.6, y: 0.55 }, authored: true })
    );
    for (const sourceTime of [0.5, 3.1, 6.25, 7.75]) {
      const clip = plan.project.clips.find(
        (clip) =>
          clip.type === 'VIDEO' &&
          sourceTime >= clip.sourceStart &&
          sourceTime < clip.sourceStart + clip.sourceDuration
      );
      if (clip?.type !== 'VIDEO') throw new Error('Expected source slice');
      const actual = resolveProjectCursorFocus(
        plan.project,
        clip.startTime + (sourceTime - clip.sourceStart) / (clip.playbackRate ?? 1),
        undefined,
        clip.id
      )!;
      const expected = evaluateReviewCursorFocus(edited, sourceTime)!;
      expect(actual.x / plan.project.width).toBeCloseTo(expected.x, 7);
      expect(actual.y / plan.project.height).toBeCloseTo(expected.y, 7);
    }
  }
);

it('preserves effective action suppression while transferring cursor authoring', () => {
  const { input } = convertedCursorProject();
  input.document.advancedContent.actionsEnabled = true;
  input.ui.tracks.actions = false;
  const plan = planReviewProjectConversion(input);
  if (plan.status !== 'prepared') throw new Error('Expected suppressed action transfer');
  expect(plan.project.actionPresentation?.enabled).toBe(false);
  expect(plan.project.cursorFocusPath?.mode).toBe('follow');
  expect(plan.project.cursorTrack?.sourceObservations).toHaveLength(1);
});

it('retains captured skin controls without activating a separate painted pointer', () => {
  const { input } = convertedCursorProject();
  const track = input.seed.cursorTrack!;
  track.captureMode = 'separate';
  track.skin = {
    color: '#ff5500',
    scale: 2,
    shadow: true,
    hidden: false,
    preset: 'RING',
    animationPreset: 'FLOAT',
  };
  const before = structuredClone(input);
  const plan = planReviewProjectConversion(input);
  if (plan.status !== 'prepared') throw new Error('Expected source skin transfer');
  expect(plan.project.cursorTrack?.captureMode).toBe('separate');
  expect(plan.project.cursorTrack?.skin).toEqual({ ...track.skin, hidden: true });
  expect(resolveVideoCompositionCursor(plan.project, 0.5, [])).toBeNull();
  expect(input).toEqual(before);
});

it('refuses authored cursor geometry for another recording without throwing or changing the source', () => {
  const { input } = convertedCursorProject();
  input.document.advancedContent.cursorFocusPath!.segments[0]!.binding = {
    kind: 'recording-source',
    recordingId: 'another-recording',
    sourceInstanceId: 'another-instance',
  };
  const before = structuredClone(input);
  expect(planReviewProjectConversion(input).status).toBe('blocked');
  expect(input).toEqual(before);
});

function denseCursorInput(count: number) {
  const { input } = cursorFixture();
  delete input.document.advancedContent.cursorFocusPath;
  const samples = Array.from({ length: count }, (_, index) => {
    const time = (index / (count - 1)) * input.source.duration;
    const point = { x: 0.1 + 0.8 * (time / input.source.duration), y: 0.5 };
    return {
      id: `dense:${index}`,
      time,
      x: point.x * input.source.width,
      y: point.y * input.source.height,
      visible: true,
      recordingPoint: point,
      observation: 'observed' as const,
      captureSegment: 0,
      observationClockId: 'source-clock',
    };
  });
  const cursorTrack = {
    captureMode: 'embedded-fallback' as const,
    skin: { ...normalizeVideoProjectCursorSkin(undefined), hidden: true },
    samples,
  };
  input.seed = createVideoProjectFromRecording({
    ...input.source,
    recordingId: 'recording',
    filename: 'Dense.webm',
    cursorTrack,
    hasAudio: true,
  });
  input.seed.id = 'conversion-1';
  return { input, cursorTrack };
}

it('retains a complete 64688-sample recording through conversion and canonical reopen', () => {
  const { input, cursorTrack } = denseCursorInput(64688);
  const before = structuredClone(input.seed.cursorTrack);
  const plan = planReviewProjectConversion(input);
  expect(plan.status).toBe('prepared');
  if (plan.status !== 'prepared') throw new Error('Expected dense recording transfer');
  expect(plan.project.cursorTrack?.sourceObservations?.[0]?.samples).toEqual(cursorTrack.samples);
  expect(isExportReadyVideoProject(plan.project)).toBe(true);
  const reopened = parseHydratableVideoProject(structuredClone(plan.project));
  expect(reopened).not.toBeNull();
  expect(reopened?.cursorTrack?.sourceObservations?.[0]?.samples).toEqual(cursorTrack.samples);
  expect(input.seed.cursorTrack).toEqual(before);
});

it.each([
  'sample-shape',
  'coordinate',
  'point',
  'skin',
  'anchor',
  'unknown-sample',
  'missing-track',
  'non-cursor-seed',
] as const)('refuses invalid %s data while admitting dense cursor facts independently', (kind) => {
  const { input } = denseCursorInput(5001);
  const track = input.seed.cursorTrack!;
  const sample = track.samples[0]!;
  if (kind === 'sample-shape') Reflect.set(track.samples, '0', null);
  if (kind === 'coordinate') Reflect.set(sample, 'x', Number.NaN);
  if (kind === 'point') Reflect.set(sample, 'recordingPoint', { x: 2, y: 0.5 });
  if (kind === 'skin') Reflect.set(track.skin, 'hidden', 'true');
  if (kind === 'anchor')
    Reflect.set(sample, 'sourceAnchor', { ...sample.sourceAnchor, kind: 'project' });
  if (kind === 'unknown-sample') Reflect.set(sample, 'unmappedAuthoring', true);
  if (kind === 'missing-track') Reflect.set(input.seed, 'cursorTrack', undefined);
  if (kind === 'non-cursor-seed') input.seed.width = 0;
  const before = structuredClone(input);
  expect(planReviewProjectConversion(input).status).toBe('blocked');
  expect(input).toEqual(before);
});
