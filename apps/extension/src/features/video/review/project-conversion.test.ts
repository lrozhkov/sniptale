import { resolveVideoProjectCompositionJoinPlans } from '../project/scene/joins';
import { planReviewCutTransitions } from './cuts';
import { expect, it, vi } from 'vitest';
import { createShapeClip } from '../project/timeline/project-meta.test.helpers';
import { getMediaClipSourceTime } from '../project/timeline/rate';
import { createBookendImagePresentation } from '../project/scene/bookend-media';
import { getClipAudioGain } from '../project/timeline/presentation.gain';
import { isExportReadyVideoProject } from '../project/validation/root';
import {
  createNeutralPresentationSettings,
  createNewWorkspacePresentationSettings,
} from './advanced/presentation';
import {
  getVideoProjectSceneEdgeAudioGain,
  resolveVideoProjectSceneEdgePlan,
} from '../project/scene/edge-fades';
import { planReviewPresentationSequence, presentationAudioGain } from './presentation-sequence';
import { buildReviewTimeMap } from './timeline';
import { REVIEW_SPEED_RATES } from './speed';
import { parseHydratableVideoProject } from '../project/validation/root';
import { planReviewProjectConversion } from './project-conversion';

import { fixture, externalAudioFixture, actionFixture } from './project-conversion.test-support';

it('builds an independent editable core through actual Native root admission without changing the source', () => {
  const input = fixture();
  input.document.advancedContent.audio.original = { volume: 1.4, muted: false };
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  expect(result.project.id).toBe(input.seed.id);
  expect(result.project.name).toBe(input.name);
  expect(result.project.assets).toEqual(input.seed.assets);
  expect(result.project.duration).toBe(7);
  expect(result.project.textDocuments![0]!.binding).toMatchObject({
    kind: 'source',
    sourceInstanceId: result.timeline.sourceInstanceId,
  });
  expect(result.project.commentDocuments![0]!.annotations).toEqual(input.document.annotations);
  const sound = result.project.clips.find((clip) => clip.type === 'AUDIO')!;
  expect(getClipAudioGain(sound, sound.startTime + 0.2)).toBe(1.4);
  expect(
    result.project.clips.filter((clip) => clip.type === 'VIDEO').every((clip) => clip.muted)
  ).toBe(true);
  expect(input).toEqual(before);
  expect(planReviewProjectConversion(input)).toEqual(result);
});

it.each(REVIEW_SPEED_RATES)(
  'preserves Gallery rate %s through Native admission without clamping',
  (rate) => {
    const input = fixture();
    input.document.edits.push({
      id: 'speed',
      kind: 'speed',
      start: 2,
      end: 6,
      requestedStart: 2,
      requestedEnd: 6,
      rate,
      audio: 'mute',
    });
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.duration).toBe(
      buildReviewTimeMap(8, input.document.edits).at(-1)!.resultEnd
    );
    const video = result.project.clips.find(
      (clip) => clip.type === 'VIDEO' && clip.sourceStart === 2
    )!;
    if (video.type !== 'VIDEO') throw new Error('Expected video');
    expect(video.playbackRate).toBe(rate);
    expect(
      Math.abs(getMediaClipSourceTime(video, video.startTime + video.duration / 2) - 2.5)
    ).toBeLessThanOrEqual(Number.EPSILON * 16);
    expect(
      result.project.clips.filter((clip) => clip.type === 'AUDIO').map((clip) => clip.muted)
    ).toEqual([false, true, true, false]);
  }
);

it.each(['recording', 'project-asset', 'library-asset'] as const)(
  'preserves the admitted %s source locator',
  (kind) => {
    const input = fixture();
    input.seed.assets[0]!.source =
      kind === 'recording'
        ? { kind, recordingId: 'recording' }
        : kind === 'project-asset'
          ? { kind, projectAssetId: 'retained' }
          : { kind, mediaId: 'library-media' };
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.assets[0]!.source).toEqual(input.seed.assets[0]!.source);
    expect(result.project.assets[0]).not.toBe(input.seed.assets[0]);
  }
);

it('converts moving source transitions without shifting any retained montage content', () => {
  const input = fixture();
  input.document.advancedContent.presentation = createNeutralPresentationSettings();
  input.document.advancedContent.background = {
    enabled: false,
    rememberedLayout: { padding: 0.1, cornerRadius: 10 },
  };
  input.document.edits[0] = {
    ...input.document.edits[0]!,
    kind: 'cut',
    transition: { type: 'dissolve', before: 0.2, after: 0.2 },
  };
  const before = structuredClone(input);
  const hardInput = structuredClone(input);
  for (const edit of hardInput.document.edits) if (edit.kind === 'cut') delete edit.transition;
  const hard = planReviewProjectConversion(hardInput),
    converted = planReviewProjectConversion(input);
  if (hard.status !== 'prepared' || converted.status !== 'prepared')
    throw new Error(JSON.stringify({ hard, converted }));
  expect(converted.project.clips).toEqual(hard.project.clips);
  expect(converted.project.duration).toBe(hard.project.duration);
  expect(converted.project.textDocuments).toEqual(hard.project.textDocuments);
  expect(converted.project.version).toBe(40);
  expect(converted.project.compositionJoins).toEqual([
    {
      id: `${input.seed.id}:cut:cut`,
      clipId: converted.timeline.cuts[0]!.incomingClipId,
      edge: 'start',
      sampling: 'cut',
      sourceRange: {
        assetId: converted.timeline.videoClips[0]!.assetId,
        sourceInstanceId: converted.timeline.sourceInstanceId,
        start: 3,
        end: 4,
      },
      transition: { type: 'dissolve', before: 0.2, after: 0.2 },
    },
  ]);
  expect(isExportReadyVideoProject(converted.project)).toBe(true);
  expect(input).toEqual(before);
});

it.each(['basic', 'advanced'] as const)(
  'transfers actual new Gallery presentation defaults in %s mode without activating dormant effects',
  (mode) => {
    const input = fixture();
    input.ui.mode = mode;
    input.document.advancedContent.background = { enabled: false, zoomBehavior: 'window' };
    const settings = createNewWorkspacePresentationSettings();
    input.document.advancedContent.presentation = settings;
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.sceneEdges).toEqual({
      intro: { enabled: mode === 'advanced', duration: 0.4, color: '#000000ff', audioFade: false },
      outro: { enabled: mode === 'advanced', duration: 0.4, color: '#000000ff', audioFade: false },
    });
    expect(result.project.bookendPresets).toEqual({
      intro: { mode: 'none' },
      outro: { mode: 'none' },
      introTransition: settings.introTransition,
      outroTransition: settings.outroTransition,
    });
    expect(result.project.sceneBackground).toEqual({
      kind: 'solid',
      color: '#000000ff',
      enabled: false,
    });
    expect(result.project.duration).toBe(7);
    const gallery = planReviewPresentationSequence({
      settings,
      mainDuration: result.project.duration,
      fragmentOffset: 0,
      includeBookends: mode === 'advanced',
      rate: { numerator: 30, denominator: 1 },
    });
    if (!gallery.ok) throw new Error(gallery.reason);
    const native = resolveVideoProjectSceneEdgePlan(result.project);
    expect(native.visualEnvelope.fadeIn).toBe(gallery.plan.visualEnvelope.fadeIn);
    expect(native.visualEnvelope.fadeOut).toBe(gallery.plan.visualEnvelope.fadeOut);
    expect(gallery.plan.segments.map((segment) => segment.name)).toEqual(['main']);
    expect(gallery.plan.joins).toBeUndefined();
    expect(getVideoProjectSceneEdgeAudioGain(result.project, 0)).toBe(1);
    expect(isExportReadyVideoProject(result.project)).toBe(true);
    expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)))).not.toBeNull();
    expect(input).toEqual(before);
  }
);

it('maps plain fades with per-edge overrides and inherited audio/color on the whole montage clock', () => {
  const input = fixture();
  const settings = createNewWorkspacePresentationSettings();
  settings.color = '#123456ff';
  settings.audioFade = true;
  settings.fadeIn = { enabled: true, duration: 0.8 };
  settings.fadeOut = { enabled: true, duration: 1.2, color: '#abcdefFF', audioFade: false };
  input.document.advancedContent.presentation = settings;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.sceneEdges).toEqual({
    intro: { enabled: true, duration: 0.8, color: '#123456ff', audioFade: true },
    outro: { enabled: true, duration: 1.2, color: '#abcdefff', audioFade: false },
  });
  const gallery = planReviewPresentationSequence({
    settings,
    mainDuration: result.project.duration,
    fragmentOffset: 0,
    includeBookends: true,
    rate: { numerator: 30, denominator: 1 },
  });
  if (!gallery.ok) throw new Error(gallery.reason);
  const native = resolveVideoProjectSceneEdgePlan(result.project);
  expect(native.color).toBe(gallery.plan.color);
  expect(native.endColor).toBe(gallery.plan.endColor);
  for (const time of [0, 0.2, 0.4, 0.8, 3.5, 6.9]) {
    expect(getVideoProjectSceneEdgeAudioGain(result.project, time)).toBeCloseTo(
      presentationAudioGain(gallery.plan, time * 48_000),
      8
    );
  }
  settings.fadeIn.duration = 12;
  settings.fadeOut.duration = 16;
  const constrained = planReviewProjectConversion(input);
  if (constrained.status !== 'prepared') throw new Error(JSON.stringify(constrained));
  expect(constrained.project.sceneEdges?.intro.duration).toBe(12);
  expect(constrained.project.sceneEdges?.outro.duration).toBe(16);
  input.ui.mode = 'basic';
  const dormant = planReviewProjectConversion(input);
  if (dormant.status !== 'prepared') throw new Error(JSON.stringify(dormant));
  expect(dormant.project.sceneEdges?.intro).toEqual({
    enabled: false,
    duration: 12,
    color: '#123456ff',
    audioFade: true,
  });
  expect(getVideoProjectSceneEdgeAudioGain(dormant.project, 0)).toBe(1);
  expect(getVideoProjectSceneEdgeAudioGain(dormant.project, 7)).toBe(1);
  expect(resolveVideoProjectSceneEdgePlan(constrained.project).visualEnvelope).toEqual({
    span: 7,
    fadeIn: 3,
    fadeOut: 4,
  });
});

it.each(['none', 'image'] as const)(
  'refuses %s media bookends instead of dropping their active or remembered resources',
  (mode) => {
    const input = fixture();
    const settings = createNeutralPresentationSettings();
    settings.intro = {
      mode,
      image: {
        ...createBookendImagePresentation(),
        assetId: 'project-asset:intro',
        width: 640,
        height: 360,
      },
    };
    input.document.advancedContent.presentation = settings;
    const before = structuredClone(input);
    expect(planReviewProjectConversion(input)).toEqual({
      status: 'blocked',
      issues: [{ kind: 'unmapped-content', field: 'presentation' }],
    });
    expect(input).toEqual(before);
  }
);

it('refuses remembered edge controls but transfers disabled camera modes', () => {
  const input = fixture();
  const settings = createNeutralPresentationSettings();
  settings.introControl = {
    mode: 'none',
    plain: { enabled: true, duration: 2 },
    media: { enabled: true, duration: 3, color: '#123456ff', audioFade: true },
  };
  input.document.advancedContent.presentation = settings;
  expect(planReviewProjectConversion(input)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'unmapped-content', field: 'presentation' }],
  });
  delete input.document.advancedContent.presentation;
  input.document.advancedContent.background = { enabled: false, zoomBehavior: 'content' };
  const result = planReviewProjectConversion(input);
  expect(result.status).toBe('prepared');
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.sceneBackground).toMatchObject({ enabled: false, zoomBehavior: 'content' });
});

it('blocks malformed inputs but retains an editable result-time tail without extending the montage', () => {
  const input = fixture();
  expect(planReviewProjectConversion({ ...input, source: { ...input.source, size: 101 } })).toEqual(
    { status: 'blocked', issues: [{ kind: 'changed-source' }] }
  );
  const bad = { ...input.seed, clips: [...input.seed.clips, createShapeClip()] };
  expect(planReviewProjectConversion({ ...input, seed: bad }).status).toBe('blocked');
  expect(
    planReviewProjectConversion({
      ...input,
      document: { ...input.document, edits: [...input.document.edits, ...input.document.edits] },
    }).status
  ).toBe('blocked');
  input.document.advancedContent.text!.fragments[0]!.timeDomain = 'result';
  input.document.advancedContent.text!.fragments[0]!.end = 9;
  const result = planReviewProjectConversion(input);
  expect(result.status).toBe('prepared');
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.project.version).toBe(37);
  const retained = result.project.textDocuments!.find((entry) => entry.binding.kind === 'project')!;
  expect(retained.durationMode).toBe('project');
  expect(retained.document.fragments[0]!.end).toBe(9);
  expect(result.project.duration).toBe(7);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  expect(input.document.advancedContent.text!.fragments[0]!.end).toBe(9);
});

it('does not acquire identity, time, or mutation authority while preparing a plan', () => {
  const { input } = actionFixture();
  const id = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new Error('Unexpected identity');
  });
  const time = vi.spyOn(Date, 'now').mockImplementation(() => {
    throw new Error('Unexpected clock');
  });
  try {
    expect(planReviewProjectConversion(input).status).toBe('prepared');
  } finally {
    id.mockRestore();
    time.mockRestore();
  }
});

it('reports invalid template timing and preserves a source after allocation failure', () => {
  const input = fixture();
  const invalid = structuredClone(input);
  invalid.seed.clips[0]!.duration = 7;
  expect(planReviewProjectConversion(invalid)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'invalid-seed', field: 'invalid-input' }],
  });
  const before = structuredClone(input);
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementationOnce(() => {
    throw new Error('Allocation failed');
  });
  try {
    expect(() => planReviewProjectConversion(input)).toThrow('Allocation failed');
  } finally {
    clone.mockRestore();
  }
  expect(input).toEqual(before);
  expect(planReviewProjectConversion(input).status).toBe('prepared');
});

it('preserves all authored source gain and static mute intent across cuts and Native reopen', async () => {
  const { getClipCompositeAudioGain } = await import('../project/timeline/presentation.gain');
  const { getProjectSourceAudioRanges } = await import('../project/source-audio');
  const input = fixture();
  input.document.advancedContent.audio.original = {
    volume: 1.5,
    muted: false,
    ranges: [
      { id: 'gain', start: 2, end: 5, volume: 2 },
      { id: 'hidden', start: 3.1, end: 3.5, volume: 0.5 },
    ],
    mutes: [{ id: 'static', kind: 'range', start: 2.5, end: 6, volume: 0.25 }],
  };
  // Manual ranges remain disjoint, including a separate range entirely hidden by the cut.
  input.document.advancedContent.audio.original.ranges![0]!.end = 3;
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  expect(result.status).toBe('prepared');
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.project.version).toBe(37);
  const document = result.project.sourceAudioDocuments![0]!;
  expect(document.ranges).toEqual(input.document.advancedContent.audio.original.ranges);
  expect(document.mutes).toEqual([{ id: 'static', start: 2.5, end: 6, volume: 0.25 }]);
  const audio = result.project.clips.find((clip) => clip.type === 'AUDIO')!;
  expect(document.binding.sourceInstanceId).toBe(audio.sourceInstanceId);
  expect(getProjectSourceAudioRanges(result.project, audio)).toEqual([
    { start: 2, end: 3, volume: 2 },
  ]);
  expect(getClipCompositeAudioGain(result.project, audio, 2.75)).toBe(0.75);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)))?.sourceAudioDocuments
  ).toEqual([document]);
  expect(input).toEqual(before);
});

it('retains an admitted neutral schema28 seed instead of lowering its schema below present fields', () => {
  const input = fixture();
  input.seed.version = 28;
  input.seed.sourceAudioDocuments = [];
  expect(isExportReadyVideoProject(input.seed)).toBe(true);
  const result = planReviewProjectConversion(input);
  expect(result.status).toBe('prepared');
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.project.version).toBe(37);
  expect(result.project.sourceAudioDocuments).toEqual([]);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
});

it('integrates actual ordinary audio mapping with Native admission, masters, and unchanged video clocks', async () => {
  const { getClipCompositeAudioGain } = await import('../project/timeline/presentation.gain');
  const input = externalAudioFixture();
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  expect(result.project.duration).toBe(7);
  expect(result.project.assets).toHaveLength(input.seed.assets.length + 1);
  expect(result.project.tracks).toHaveLength(input.seed.tracks.length + 2);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  const voice = result.project.clips.find((clip) => clip.trackId === 'voice-track')!;
  const music = result.project.clips.find((clip) => clip.trackId === 'music-track')!;
  expect(voice).toMatchObject({
    startTime: 1,
    duration: 4,
    sourceStart: 0.5,
    sourceDuration: 1,
    playbackRate: 0.25,
    fadeInMs: 1000,
    fadeOutMs: 2000,
  });
  expect(getClipCompositeAudioGain(result.project, voice, 1.5)).toBe(2);
  expect(getClipCompositeAudioGain(result.project, voice, 2)).toBe(4);
  expect(getClipCompositeAudioGain(result.project, music, 2.5)).toBeCloseTo(0.1, 12);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(result.project)))?.clips).toEqual(
    result.project.clips
  );
  expect(planReviewProjectConversion(input)).toEqual(result);
  expect(input).toEqual(before);
});

it.each(['asset', 'track'] as const)(
  'refuses external audio %s IDs that conflict with seed identities without a partial root',
  (kind) => {
    const input = externalAudioFixture();
    if (kind === 'asset') input.externalAudio.assets[0]!.asset.id = input.seed.assets[0]!.id;
    else input.externalAudio.tracks.voiceover.id = input.seed.tracks[0]!.id;
    const before = structuredClone(input);
    expect(planReviewProjectConversion(input)).toEqual({
      status: 'blocked',
      issues: [{ kind: 'audio-resources', field: 'seed-identity' }],
    });
    expect(input).toEqual(before);
  }
);

it('converts retained audio tails without extending the montage', async () => {
  const input = externalAudioFixture();
  input.document.advancedContent.audio.music[0]!.timelineStart = 6;
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  const { syncProjectDuration } = await import('../project/timeline/basics');
  expect(result.project.version).toBe(37);
  expect(syncProjectDuration(result.project).duration).toBe(7);
  expect(result.project.clips.find((clip) => clip.trackId === 'music-track')).toMatchObject({
    durationMode: 'project',
    startTime: 6,
    duration: 3,
    sourceDuration: 3,
    fadeOutMs: 1000,
  });
  expect(input).toEqual(before);
  expect(
    planReviewProjectConversion({
      ui: input.ui,
      seed: input.seed,
      name: input.name,
      source: input.source,
      document: input.document,
    })
  ).toEqual({
    status: 'blocked',
    issues: [{ kind: 'audio-resources' }],
  });
});

it('does not manufacture resource or placement identities while planning external audio', () => {
  const input = externalAudioFixture();
  const id = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new Error('Unexpected identity');
  });
  const time = vi.spyOn(Date, 'now').mockImplementation(() => {
    throw new Error('Unexpected clock');
  });
  try {
    expect(planReviewProjectConversion(input).status).toBe('prepared');
  } finally {
    id.mockRestore();
    time.mockRestore();
  }
});

it('preserves Gallery live take attenuation through cuts speed and Native edits', async () => {
  const { getClipCompositeAudioGain } = await import('../project/timeline/presentation.gain');
  const { resolveOriginalSourceAudio } = await import('./advanced/original-audio-mutes');
  const { originalAudioGainAt } = await import('./advanced/original-audio');
  const { applyVideoProjectMutationPatch } = await import('../project/mutation');
  const { updateProjectOriginalAudioVolume } = await import('../project/timeline/original-audio');
  const { hydrateVideoProject } = await import('../project/hydration');
  const input = externalAudioFixture();
  input.document.edits.push({
    id: 'speed',
    kind: 'speed',
    start: 0,
    end: 2,
    requestedStart: 0,
    requestedEnd: 2,
    rate: 2,
    audio: 'speed',
  });
  input.document.advancedContent.audio.voiceoverSegments = buildReviewTimeMap(
    input.source.duration,
    input.document.edits
  );
  input.document.advancedContent.audio.original = {
    volume: 0.8,
    muted: false,
    ranges: [{ id: 'manual', start: 0, end: 8, volume: 1.5 }],
    mutes: [
      { id: 'live-mute', kind: 'take', clipId: 'voice' },
      { id: 'static', kind: 'range', start: 6, end: 8, volume: 0.5 },
    ],
  };
  // Gallery suppression follows a take even when its sound is manually muted.
  input.document.advancedContent.audio.voiceover[0]!.muted = true;
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result.issues));
  const take = result.project.clips.find((clip) => clip.trackId === 'voice-track');
  if (take?.type !== 'AUDIO') throw new Error('Missing take');
  expect(take).toMatchObject({
    originalAudioMute: {
      volume: 0,
      targets: [
        {
          assetId: input.seed.assets[0]!.id,
          sourceInstanceId: result.timeline.audioSourceInstanceId,
        },
      ],
    },
  });
  const gallery = resolveOriginalSourceAudio(input.document.advancedContent.audio);
  for (const clip of result.project.clips.filter(
    (clip) =>
      clip.type === 'AUDIO' && clip.sourceInstanceId === result.timeline.audioSourceInstanceId
  )) {
    if (clip.type !== 'AUDIO') throw new Error('Expected original audio');
    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const time = clip.startTime + fraction * clip.duration;
      expect(getClipCompositeAudioGain(result.project, clip, time)).toBeCloseTo(
        originalAudioGainAt(gallery, getMediaClipSourceTime(clip, time), input.document.edits),
        12
      );
    }
    expect(
      getClipCompositeAudioGain(
        result.project,
        { ...clip, sourceInstanceId: 'separate-insertion' },
        clip.startTime + 0.1
      )
    ).toBeCloseTo(0.8, 12);
  }
  const original = result.project.clips.find(
    (clip) =>
      clip.type === 'AUDIO' &&
      clip.sourceInstanceId === result.timeline.audioSourceInstanceId &&
      clip.sourceStart === 4
  );
  if (!original) throw new Error('Missing original span');
  expect(getClipCompositeAudioGain(result.project, original, 3)).toBe(0);
  const moved = applyVideoProjectMutationPatch(result.project, {
    clips: result.project.clips.map((clip) =>
      clip.id === take.id ? { ...take, startTime: 4, duration: 1, sourceDuration: 0.25 } : clip
    ),
  });
  expect(getClipCompositeAudioGain(moved, original, 3)).toBeCloseTo(1.2, 12);
  expect(getClipCompositeAudioGain(moved, original, 4.5)).toBe(0);
  const restored = updateProjectOriginalAudioVolume(moved, take.id, undefined);
  expect(getClipCompositeAudioGain(restored, original, 4.5)).toBeCloseTo(0.6, 12);
  expect(restored.sourceAudioDocuments).toEqual(result.project.sourceAudioDocuments);
  expect(restored.clips.find((clip) => clip.id === original.id)).toBe(original);
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(moved)));
  const reopenedTake = reopened.clips.find((clip) => clip.id === take.id);
  if (reopenedTake?.type !== 'AUDIO') throw new Error('Missing reopened take');
  expect(reopenedTake.originalAudioMute).toEqual(take.originalAudioMute);
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  expect(getClipCompositeAudioGain(reopened, original, 4.5)).toBe(0);
  expect(input).toEqual(before);
  expect(planReviewProjectConversion(input)).toEqual(result);
});

it(
  'uses the existing effective owner to suppress captions and actions in basic mode ' +
    'while retaining authored text',
  () => {
    const input = fixture();
    input.ui.mode = 'basic';
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.actionPresentation!.enabled).toBe(false);
    expect(result.project.textDocuments![0]!.captions!.enabled).toBe(false);
    expect(result.project.textDocuments![0]!.document.fragments).toEqual(
      input.document.advancedContent.text!.fragments
    );
    expect(input).toEqual(before);
    input.ui.mode = 'advanced';
    const applied = planReviewProjectConversion(input);
    if (applied.status !== 'prepared') throw new Error(JSON.stringify(applied));
    expect(applied.project.textDocuments![0]!.captions!.enabled).toBe(true);
  }
);

it('keeps Gallery allocation between neighboring cut transitions when one requested side exceeds the island', () => {
  const input = fixture();
  input.document.edits = [
    {
      id: 'left',
      kind: 'cut',
      start: 1,
      end: 2,
      requestedStart: 1,
      requestedEnd: 2,
      transition: { type: 'dissolve', before: 0.2, after: 0.1 },
    },
    {
      id: 'right',
      kind: 'cut',
      start: 3,
      end: 4,
      requestedStart: 3,
      requestedEnd: 4,
      transition: { type: 'dissolve', before: 2, after: 0.2 },
    },
  ];
  const before = structuredClone(input);
  const converted = planReviewProjectConversion(input);
  if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
  const reference = planReviewCutTransitions(input.source.duration, input.document.edits);
  const native = resolveVideoProjectCompositionJoinPlans(converted.project);
  expect(native.map(({ seam, before, after }) => ({ seam, before, after }))).toEqual(
    reference.map(({ seam, before, after }) => ({ seam, before, after }))
  );
  expect(converted.project.duration).toBe(6);
  expect(input).toEqual(before);
});

it('retains edge and adjacent cut transition recipes without inventing media placements', () => {
  const input = fixture();
  input.document.edits = [
    {
      id: 'edge',
      kind: 'cut',
      start: 0,
      end: 0.3,
      requestedStart: 0,
      requestedEnd: 0.3,
      transition: { type: 'dissolve', before: 0.2, after: 0.4 },
    },
    {
      id: 'adjacent-left',
      kind: 'cut',
      start: 2.1,
      end: 3,
      requestedStart: 2.1,
      requestedEnd: 3,
      transition: { type: 'fade-black', before: 0.5, after: 0.2, color: '#123456' },
    },
    {
      id: 'adjacent-right',
      kind: 'cut',
      start: 3,
      end: 4.2,
      requestedStart: 3,
      requestedEnd: 4.2,
      transition: { type: 'dissolve', before: 0.1, after: 0.6 },
    },
  ];
  const before = structuredClone(input),
    converted = planReviewProjectConversion(input);
  if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
  expect(converted.project.compositionJoins).toHaveLength(3);
  expect(converted.project.compositionJoins!.map((join) => join.clipId)).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
  for (const edit of input.document.edits) {
    if (edit.kind !== 'cut') continue;
    expect(
      converted.project.compositionJoins!.find(
        (join) => join.id === `${input.seed.id}:cut:${edit.id}`
      )
    ).toEqual({
      id: `${input.seed.id}:cut:${edit.id}`,
      sampling: 'cut',
      transition: edit.transition,
      sourceRange: {
        assetId: converted.timeline.videoClips[0]!.assetId,
        sourceInstanceId: converted.timeline.sourceInstanceId,
        start: edit.start,
        end: edit.end,
      },
    });
  }
  expect(resolveVideoProjectCompositionJoinPlans(converted.project)).toEqual([]);
  expect(converted.project.clips.filter((clip) => clip.type === 'VIDEO')).toHaveLength(2);
  expect(converted.project.duration).toBeCloseTo(input.source.duration - 2.4, 12);
  expect(isExportReadyVideoProject(converted.project)).toBe(true);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(converted.project)))?.compositionJoins
  ).toEqual(converted.project.compositionJoins);
  expect(input).toEqual(before);
});
