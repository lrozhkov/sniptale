import type { ReviewProjectBookendResource } from './project-presentation';
import { expect, it } from 'vitest';
import { createVideoProjectAsset } from '../project/factories/creation';
import { hydrateVideoProject } from '../project/hydration';
import { isExportReadyVideoProject } from '../project/validation/root';
import { resolveVideoProjectCompositionJoinPlans } from '../project/scene/joins';
import { getProjectAssetUseCounts } from '../project/media-usage';
import { getClipAudioGain } from '../project/timeline/presentation.gain';
import { getMediaClipSourceTime } from '../project/timeline/rate';
import { calculateProjectDuration, isClipActiveAtTime } from '../project/timeline/basics';
import { planReviewPresentationSequence } from './presentation-sequence';
import {
  createBookendImagePresentation,
  createBookendVideoPresentation,
} from '../project/scene/bookend-media';
import { createNeutralPresentationSettings } from './advanced/presentation';
import { planReviewProjectConversion } from './project-conversion';
import { fixture } from './project-conversion.test-support';

function bookendFixture() {
  const input = fixture();
  const image = createVideoProjectAsset(
    'Card',
    'IMAGE',
    { kind: 'project-asset', projectAssetId: 'card' },
    {
      width: 32,
      height: 16,
      duration: null,
      hasAudio: false,
      audioPeaks: null,
      size: 100,
      mimeType: 'image/png',
    }
  );
  const video = createVideoProjectAsset(
    'Outro',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'movie' },
    {
      width: 640,
      height: 360,
      duration: 3,
      hasAudio: true,
      audioPeaks: null,
      size: 200,
      mimeType: 'video/webm',
    }
  );
  const settings = createNeutralPresentationSettings();
  const card = {
    ...createBookendImagePresentation(),
    duration: 1,
    assetId: 'project-asset:card',
    width: 32,
    height: 16,
    fillColor: '#123456ff',
  };
  const movie = {
    ...createBookendVideoPresentation(3),
    assetId: 'project-asset:movie',
    trim: { start: 1, end: 2 },
    audio: { muted: false, gain: 0.7 },
    source: { duration: 3, width: 640, height: 360, size: 200, mimeType: 'video/webm' },
  };
  settings.intro = { mode: 'image', image: card, video: movie };
  settings.outro = { mode: 'video', image: card, video: movie };
  settings.introControl = {
    mode: 'media',
    plain: { enabled: true, duration: 2 },
    media: { enabled: true, duration: 0.4, color: '#112233ff', audioFade: true },
  };
  settings.outroControl = {
    mode: 'media',
    plain: { enabled: true, duration: 3 },
    media: { enabled: true, duration: 0.5, color: '#abcdefFF', audioFade: false },
  };
  settings.introTransition = { type: 'dissolve', before: 0.2, after: 0.3 };
  settings.outroTransition = { type: 'fade-black', color: '#fedcbaff', before: 0.3, after: 0.2 };
  input.document.advancedContent.presentation = settings;
  const bookendAssets: ReviewProjectBookendResource[] = [
    { reviewAssetId: 'project-asset:card', asset: image },
    { reviewAssetId: 'project-asset:movie', asset: video, source: structuredClone(movie.source) },
  ];
  return { ...input, bookendAssets };
}

it('converts active image/video bookends and retained variants into independent ordinary Native clips', () => {
  const input = bookendFixture();
  const before = structuredClone(input);
  const baselineInput = fixture();
  baselineInput.seed = structuredClone(input.seed);
  const baseline = planReviewProjectConversion(baselineInput);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared' || baseline.status !== 'prepared')
    throw new Error(JSON.stringify(result));
  const project = result.project;
  expect(project.version).toBe(41);
  expect(project.duration).toBe(9);
  expect(project.assets).toHaveLength(baseline.project.assets.length + 2);
  for (const clip of baseline.project.clips) {
    const translated = project.clips.find(({ id }) => id === clip.id)!;
    expect(translated.startTime).toBe(clip.startTime + 1);
    expect(translated.duration).toBe(clip.duration);
    if ('sourceStart' in clip)
      expect(translated).toMatchObject({
        sourceStart: clip.sourceStart,
        sourceDuration: clip.sourceDuration,
        playbackRate: clip.playbackRate,
      });
  }
  const intro = project.clips.find(({ id }) => id === `${project.id}:bookend:intro:media`)!;
  expect(intro).toMatchObject({ type: 'IMAGE', startTime: 0, duration: 1, linkMode: 'LINKED' });
  expect(project.clips.find(({ id }) => id === `${project.id}:bookend:intro:fill`)).toMatchObject({
    type: 'SHAPE',
    startTime: 0,
    duration: 1,
    groupId: intro.groupId,
    style: { fillColor: '#123456ff' },
  });
  expect(project.clips.find(({ id }) => id === `${project.id}:bookend:outro:media`)).toMatchObject({
    type: 'VIDEO',
    startTime: 8,
    duration: 1,
    sourceStart: 1,
    sourceDuration: 1,
    playbackRate: 1,
    muted: true,
  });
  expect(project.clips.find(({ id }) => id === `${project.id}:bookend:outro:audio`)).toMatchObject({
    type: 'AUDIO',
    startTime: 8,
    duration: 1,
    sourceStart: 1,
    sourceDuration: 1,
    muted: false,
    audioGainStart: 0.7,
  });
  expect(resolveVideoProjectCompositionJoinPlans(project).map(({ seam }) => seam)).toEqual([1, 8]);
  expect(project.bookendPresets?.intro).toMatchObject({
    mode: 'image',
    image: { assetId: input.bookendAssets[0]!.asset.id },
    video: { assetId: input.bookendAssets[1]!.asset.id },
    edgeControl: { plain: { duration: 2 }, media: { duration: 0.4 } },
  });
  expect(project.sceneEdges).toEqual({
    intro: { enabled: true, duration: 0.4, color: '#112233ff', audioFade: true },
    outro: { enabled: true, duration: 0.5, color: '#abcdefff', audioFade: false },
  });
  expect(isExportReadyVideoProject(project)).toBe(true);
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(project)));
  expect(reopened.bookendPresets).toEqual(project.bookendPresets);
  expect(
    reopened.clips.map(({ id, startTime, duration }) => ({ id, startTime, duration }))
  ).toEqual(project.clips.map(({ id, startTime, duration }) => ({ id, startTime, duration })));
  expect(
    getProjectAssetUseCounts(reopened).get(input.bookendAssets[0]!.asset.id)
  ).toBeGreaterThanOrEqual(2);
  expect(input).toEqual(before);
});

it.each(['basic', 'none'] as const)(
  'retains all bookend bytes and settings in %s without creating hidden timeline content',
  (mode) => {
    const input = bookendFixture();
    if (mode === 'basic') input.ui.mode = 'basic';
    else {
      input.document.advancedContent.presentation!.introControl!.mode = 'none';
      input.document.advancedContent.presentation!.outroControl!.mode = 'none';
    }
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.duration).toBe(7);
    expect(result.project.clips.some(({ id }) => id.includes(':bookend:'))).toBe(false);
    expect(result.project.bookendPresets?.intro.image).toBeDefined();
    expect(result.project.bookendPresets?.intro.video).toBeDefined();
    expect(result.project.sceneEdges?.intro.enabled).toBe(false);
    expect(result.project.sceneEdges?.intro.duration).toBe(mode === 'none' ? 2 : 0.4);
    expect(isExportReadyVideoProject(hydrateVideoProject(result.project))).toBe(true);
  }
);

it.each(['missing', 'duplicate', 'changed-source', 'extra'] as const)(
  'refuses %s bookend resources before publication',
  (failure) => {
    const input = bookendFixture();
    if (failure === 'missing') input.bookendAssets.pop();
    if (failure === 'duplicate') input.bookendAssets[1] = input.bookendAssets[0]!;
    if (failure === 'changed-source') input.bookendAssets[1]!.source!.duration = 4;
    if (failure === 'extra')
      input.bookendAssets.push({
        ...input.bookendAssets[0]!,
        reviewAssetId: 'project-asset:extra',
      });
    const before = structuredClone(input);
    expect(planReviewProjectConversion(input)).toEqual({
      status: 'blocked',
      issues: [{ kind: 'unmapped-content', field: 'presentation-assets' }],
    });
    expect(input).toEqual(before);
  }
);

it('refuses a nonaligned video boundary instead of retiming its source or losing the authored interval', () => {
  const input = bookendFixture();
  const settings = input.document.advancedContent.presentation!;
  settings.intro = { ...settings.intro, mode: 'video', video: settings.intro.video! };
  settings.intro.video.trim.end = 1.15;
  const before = structuredClone(input);
  expect(planReviewProjectConversion(input)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'unmapped-content', field: 'presentation-timing' }],
  });
  expect(input).toEqual(before);
});

it('retains authored transition portions when a short card already fits the frame lattice', () => {
  const input = bookendFixture();
  const settings = input.document.advancedContent.presentation!;
  settings.intro.image!.duration = 0.1;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(
    result.project.compositionJoins?.find(
      ({ id }) => id === `${result.project.id}:bookend:intro:join`
    )?.transition
  ).toEqual(settings.introTransition);
  expect(
    result.project.compositionJoins?.find(
      ({ id }) => id === `${result.project.id}:bookend:outro:join`
    )?.transition
  ).toEqual(settings.outroTransition);
});

it.each([24, 30, 60])(
  'places fractional image cards at %sfps without changing main clocks',
  (fps) => {
    const input = bookendFixture();
    input.seed.fps = fps;
    const settings = input.document.advancedContent.presentation!;
    const duration = fps === 60 ? 0.145 : 0.15;
    settings.intro.image!.duration = duration;
    settings.outro = { ...settings.outro, mode: 'image', image: { ...settings.intro.image! } };
    const original = structuredClone(input);
    const baselineInput = structuredClone(input);
    delete baselineInput.document.advancedContent.presentation;
    baselineInput.bookendAssets = [];
    const baseline = planReviewProjectConversion(baselineInput);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared' || baseline.status !== 'prepared')
      throw new Error(JSON.stringify(result));
    const project = hydrateVideoProject(JSON.parse(JSON.stringify(result.project)));
    const offset = Math.round(duration * fps) / fps;
    expect(project.duration).toBeCloseTo(7 + 2 * duration, 12);
    expect(calculateProjectDuration(project)).toBeCloseTo(project.duration, 12);
    expect(isExportReadyVideoProject(project)).toBe(true);
    expect(project.bookendPresets?.intro.image?.duration).toBe(duration);
    expect(project.bookendPresets?.outro.image?.duration).toBe(duration);
    const intro = project.clips.find(({ id }) => id === `${project.id}:bookend:intro:media`)!;
    const outro = project.clips.find(({ id }) => id === `${project.id}:bookend:outro:media`)!;
    expect(intro.duration).toBe(offset);
    expect(outro.startTime).toBe(7 + offset);
    expect(outro.startTime + outro.duration).toBeCloseTo(project.duration, 12);
    for (const clip of hydrateVideoProject(baseline.project).clips) {
      const moved = project.clips.find(({ id }) => id === clip.id)!;
      expect(moved).toEqual({ ...clip, startTime: clip.startTime + offset });
      if (moved.type === 'VIDEO' && clip.type === 'VIDEO') {
        expect(getMediaClipSourceTime(moved, moved.startTime + 0.2)).toBeCloseTo(
          getMediaClipSourceTime(clip, clip.startTime + 0.2),
          12
        );
      }
      expect(getClipAudioGain(moved, moved.startTime + 0.2)).toBeCloseTo(
        getClipAudioGain(clip, clip.startTime + 0.2),
        12
      );
    }
    const sequence = planReviewPresentationSequence({
      settings,
      mainDuration: 7,
      fragmentOffset: 0,
      includeBookends: true,
      rate: { numerator: fps, denominator: 1 },
    });
    if (!sequence.ok) throw new Error('Missing Gallery sequence');
    for (let tick = 0; tick < sequence.plan.candidateCount; tick++) {
      const time = tick / fps;
      const expected = sequence.plan.segments.find(
        (segment) => tick >= segment.startTick && tick < segment.endTick
      )!;
      if (expected.name === 'intro') expect(isClipActiveAtTime(intro, time)).toBe(true);
      else if (expected.name === 'outro') expect(isClipActiveAtTime(outro, time)).toBe(true);
      else {
        expect(isClipActiveAtTime(intro, time)).toBe(false);
        expect(isClipActiveAtTime(outro, time)).toBe(false);
      }
    }
    expect(input).toEqual(original);
  }
);

it('still refuses image cards when their main slot needs a different content duration', () => {
  const input = bookendFixture();
  input.document.edits[0]!.end = 3.87;
  input.document.edits[0]!.requestedEnd = 3.87;
  const settings = input.document.advancedContent.presentation!;
  settings.intro.image!.duration = 0.15;
  settings.outro = { ...settings.outro, mode: 'image', image: { ...settings.intro.image! } };
  const before = structuredClone(input);
  expect(planReviewProjectConversion(input)).toEqual({
    status: 'blocked',
    issues: [{ kind: 'unmapped-content', field: 'presentation-timing' }],
  });
  expect(input).toEqual(before);
});

it.each(['codec-mime', 'audio-tail'] as const)(
  'preserves the video trim with canonical Native %s metadata',
  (variant) => {
    const input = bookendFixture();
    if (variant === 'codec-mime')
      input.bookendAssets[1]!.asset.metadata.mimeType = 'video/webm; codecs="vp8"';
    else input.bookendAssets[1]!.asset.metadata.duration = 3.008;
    const result = planReviewProjectConversion(input);
    expect(result.status).toBe('prepared');
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.bookendPresets?.outro.video?.trim).toEqual({ start: 1, end: 2 });
  }
);

it('preserves independent bookend joins and verified source-cut portions', () => {
  const input = bookendFixture();
  input.document.edits = [
    {
      id: 'cut',
      kind: 'cut',
      start: 0.03,
      end: 0.83,
      requestedStart: 0.03,
      requestedEnd: 0.83,
      transition: { type: 'dissolve', before: 0.2, after: 0.2 },
    },
  ];
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status === 'prepared') {
    const cut = resolveVideoProjectCompositionJoinPlans(result.project).find(
      ({ boundary }) => boundary.sampling === 'cut'
    );
    expect(
      cut?.before,
      'The source cut must retain its complete 0.03 s outgoing portion'
    ).toBeCloseTo(0.03, 8);
  }
  expect(result.status).toBe('prepared');
  if (result.status === 'prepared') {
    const intro = resolveVideoProjectCompositionJoinPlans(result.project).find(
      ({ boundary }) => boundary.id === `${result.project.id}:bookend:intro:join`
    )!;
    expect(intro.before).toBeCloseTo(0.2, 8);
    expect(intro.after).toBeCloseTo(0.3, 8);
    expect(
      hydrateVideoProject(JSON.parse(JSON.stringify(result.project))).compositionJoins
    ).toEqual(result.project.compositionJoins);
  }
  expect(input).toEqual(before);
  delete input.document.advancedContent.presentation!.introTransition;
  expect(planReviewProjectConversion(input).status).toBe('prepared');
});

it('transfers the final-canvas Gallery watermark with bookends without creating a source binding', async () => {
  const input = bookendFixture();
  const { createQuickEditWatermark } = await import('../project/scene/watermark');
  input.document.advancedContent.watermark = { ...createQuickEditWatermark('Main'), mode: 'text' };
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.version).toBe(41);
  expect(result.project.watermarkSource).toBeUndefined();
  expect(result.project.watermark).toEqual(input.document.advancedContent.watermark);
  expect(hydrateVideoProject(JSON.parse(JSON.stringify(result.project))).watermark).toEqual(
    result.project.watermark
  );
});
