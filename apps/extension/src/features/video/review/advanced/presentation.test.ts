import { describe, expect, it } from 'vitest';
import {
  createNeutralPresentationSettings,
  createNewWorkspacePresentationSettings,
  parseQuickEditPresentationSettings,
} from './presentation';

function variants() {
  const frame = { fit: 'contain', fillColor: '#000', crop: { panX: 0, panY: 0 } };
  return {
    image: { ...frame, assetId: 'project-asset:image', width: 1920, height: 1080, duration: 3 },
    video: {
      ...frame,
      assetId: 'library-video',
      source: { duration: 12, width: 1920, height: 1080, mimeType: 'video/webm', size: 1024 },
      trim: { start: 2, end: 10 },
      audio: { muted: false, gain: 1 },
    },
  };
}
function payload() {
  return { ...createNeutralPresentationSettings(), intro: { mode: 'none', ...variants() } };
}

describe('presentation settings', () => {
  it('distinguishes legacy omission from new workspace defaults with independent objects', () => {
    const neutral = createNeutralPresentationSettings();
    expect(parseQuickEditPresentationSettings(undefined)).toEqual(neutral);
    const fresh = createNewWorkspacePresentationSettings();
    expect(fresh).toEqual({
      ...neutral,
      fadeIn: { enabled: true, duration: 0.4 },
      fadeOut: { enabled: true, duration: 0.4 },
      introTransition: { type: 'dissolve', before: 0.2, after: 0.2 },
      outroTransition: { type: 'dissolve', before: 0.2, after: 0.2 },
    });
    fresh.intro.mode = 'none';
    fresh.fadeIn.duration = 2;
    expect(createNewWorkspacePresentationSettings().fadeIn.duration).toBe(0.4);
    expect(fresh.intro).not.toBe(fresh.outro);
    expect(neutral.fadeIn.enabled).toBe(false);
  });
  it.each(['none', 'image', 'video'])('retains both remembered variants in %s mode', (mode) => {
    const input = payload();
    input.intro.mode = mode;
    const parsed = parseQuickEditPresentationSettings(input)!;
    expect(parsed.intro.mode).toBe(mode);
    expect(parsed.intro.image?.duration).toBe(3);
    expect(parsed.intro.video?.trim).toEqual({ start: 2, end: 10 });
    expect(parsed.intro.image?.fillColor).toBe('#000000ff');
    expect(parsed.outro).toEqual({ mode: 'none' });
    expect(parsed.intro.image?.crop).not.toBe(input.intro.image.crop);
  });
  it('supports independent active slots and normalizes opaque colors', () => {
    const input = payload();
    const parsed = parseQuickEditPresentationSettings({
      ...input,
      color: '#ABC',
      intro: { ...input.intro, mode: 'image' },
      outro: { mode: 'video', video: variants().video },
    });
    expect(parsed?.color).toBe('#aabbccff');
    expect(parsed?.intro.mode).toBe('image');
    expect(parsed?.outro.mode).toBe('video');
  });
  it.each([
    null,
    {},
    [],
    1,
    { ...createNeutralPresentationSettings(), surprise: true },
    { ...createNeutralPresentationSettings(), intro: { mode: 'image' } },
    { ...createNeutralPresentationSettings(), outro: { mode: 'video' } },
  ])('rejects malformed root or active slots %#', (input) => {
    expect(parseQuickEditPresentationSettings(input)).toBeNull();
  });
  it.each([NaN, Infinity, -1, 60.1])('rejects invalid remembered fade duration %s', (duration) => {
    expect(
      parseQuickEditPresentationSettings({ ...payload(), fadeIn: { enabled: false, duration } })
    ).toBeNull();
  });
  it.each(['transparent', '#00000000', '#123456fe', 'not-a-color'])(
    'rejects nonopaque or invalid fade/fill %s',
    (color) => {
      const input = payload();
      expect(parseQuickEditPresentationSettings({ ...input, color })).toBeNull();
      input.intro.image.fillColor = color;
      expect(parseQuickEditPresentationSettings(input)).toBeNull();
    }
  );
  it.each(['', ' x', 'x ', 'x\u0000', 'x\u007f', 'x'.repeat(257)])(
    'rejects invalid retained identities %#',
    (assetId) => {
      const input = payload();
      input.intro.image.assetId = assetId;
      expect(parseQuickEditPresentationSettings(input)).toBeNull();
    }
  );
  it.each([
    { width: 4097 },
    { width: 4096, height: 4096 },
    { height: 1.5 },
    { duration: 0.099 },
    { duration: 60.1 },
    { fit: 'stretch' },
    { crop: { panX: -1.1, panY: 0 } },
    { crop: { panX: 0, panY: NaN } },
    { unexpected: true },
  ])('rejects malformed dormant image %#', (change) => {
    const input = payload();
    expect(
      parseQuickEditPresentationSettings({
        ...input,
        intro: { ...input.intro, image: { ...input.intro.image, ...change } },
      })
    ).toBeNull();
  });
  it.each([
    { trim: { start: 10, end: 10 } },
    { trim: { start: -1, end: 2 } },
    { trim: { start: 1, end: 13 } },
    { audio: { muted: false, gain: 2.1 } },
    { audio: { muted: 'yes', gain: 1 } },
    { extra: 1 },
  ])('rejects malformed dormant video %#', (change) => {
    const input = payload();
    expect(
      parseQuickEditPresentationSettings({
        ...input,
        intro: { ...input.intro, video: { ...input.intro.video, ...change } },
      })
    ).toBeNull();
  });
  it.each([
    { duration: 3600.1 },
    { duration: 0 },
    { width: 16385 },
    { width: 10000, height: 5000 },
    { size: 512 * 1024 * 1024 + 1 },
    { size: 1.5 },
    { mimeType: 'image/png' },
    { mimeType: 'video/webm\n' },
    { extra: 1 },
  ])('rejects invalid admitted source metadata %#', (change) => {
    const input = payload();
    input.intro.video.source = { ...input.intro.video.source, ...change };
    expect(parseQuickEditPresentationSettings(input)).toBeNull();
  });
  it('accepts inclusive limits without coercion', () => {
    const input = payload();
    Object.assign(input.intro.image, {
      width: 4000,
      height: 4000,
      duration: 60,
      crop: { panX: -1, panY: 1 },
    });
    Object.assign(input.intro.video.source, {
      duration: 3600,
      width: 10000,
      height: 4000,
      size: 512 * 1024 * 1024,
    });
    input.intro.video.trim = { start: 0, end: 3600 };
    input.intro.video.audio.gain = 2;
    expect(parseQuickEditPresentationSettings(input)).not.toBeNull();
  });
});

it('preserves legacy omission and rejects malformed authored join settings', () => {
  const legacy = createNeutralPresentationSettings();
  expect(parseQuickEditPresentationSettings(legacy)).not.toHaveProperty('introTransition');
  for (const transition of [
    null,
    {},
    { type: 'dissolve', before: 0, after: 0 },
    { type: 'fade-black', before: 1, after: 1, color: '#00000000' },
    { type: 'dissolve', before: -1, after: 1 },
  ]) {
    expect(
      parseQuickEditPresentationSettings({ ...legacy, introTransition: transition })
    ).toBeNull();
  }
  const valid = {
    ...legacy,
    outroTransition: { type: 'fade-black', before: 0, after: 0.4, color: '#ffffff' },
  };
  expect(parseQuickEditPresentationSettings(valid)).toEqual(valid);
});

it('retains independent plain and media fades across parser roundtrips and disabled edges', async () => {
  const { presentationEdgeControl, resolvePresentationSettings } = await import('./presentation');
  const settings = createNewWorkspacePresentationSettings();
  const before = presentationEdgeControl(settings, 'intro');
  settings.introControl = {
    ...before,
    mode: 'fade',
    plain: { enabled: true, duration: 1.2, color: '#ff0000ff', audioFade: true },
  };
  settings.outroControl = {
    ...presentationEdgeControl(settings, 'outro'),
    mode: 'fade',
    plain: { enabled: true, duration: 0.5, color: '#0000ffff', audioFade: false },
  };
  const parsed = parseQuickEditPresentationSettings(JSON.parse(JSON.stringify(settings)))!;
  const active = resolvePresentationSettings(parsed);
  expect(active.fadeIn.color).toBe('#ff0000ff');
  expect(active.fadeOut.color).toBe('#0000ffff');
  expect(active.fadeIn.audioFade).toBe(true);
  expect(active.fadeOut.audioFade).toBe(false);
  parsed.introControl!.mode = 'media';
  expect(resolvePresentationSettings(parsed).fadeIn.enabled).toBe(false);
  parsed.introControl!.mode = 'none';
  expect(resolvePresentationSettings(parsed).fadeIn.enabled).toBe(false);
  parsed.introControl!.mode = 'fade';
  expect(resolvePresentationSettings(parsed).fadeIn.duration).toBe(1.2);
});

it('rejects malformed inactive edge controls rather than discarding their settings', () => {
  const base = createNeutralPresentationSettings();
  const valid = { mode: 'none', plain: base.fadeIn, media: base.fadeOut };
  for (const patch of [
    { mode: 'unexpected' },
    { plain: { enabled: true, duration: NaN } },
    { media: { enabled: false, duration: 1, color: '#00000000' } },
    { media: { enabled: false, duration: 1, audioFade: 'false' } },
    { extra: true },
  ])
    expect(
      parseQuickEditPresentationSettings({ ...base, introControl: { ...valid, ...patch } })
    ).toBeNull();
});

it('keeps remembered media fade dormant while the media slot is empty', async () => {
  const { resolvePresentationSettings } = await import('./presentation');
  const settings = createNeutralPresentationSettings();
  settings.introControl = {
    mode: 'media',
    plain: settings.fadeIn,
    media: { enabled: true, duration: 2 },
  };
  expect(resolvePresentationSettings(settings).fadeIn.enabled).toBe(false);
  expect(settings.introControl.media.enabled).toBe(true);
});

it('uses the inspector timing projection for a shortened main beside a longer bookend', async () => {
  const { constrainPresentationTiming } = await import('./presentation');
  const { planReviewPresentationSequence } = await import('../presentation-sequence');
  const settings = createNeutralPresentationSettings();
  settings.introControl = {
    mode: 'fade',
    plain: { enabled: true, duration: 5, audioFade: true },
    media: { enabled: false, duration: 4 },
  };
  settings.outro = {
    mode: 'image',
    image: { ...variants().image, fit: 'contain', duration: 6 },
  };
  settings.outroControl = {
    mode: 'media',
    plain: { enabled: true, duration: 5 },
    media: { enabled: false, duration: 4 },
  };
  const before = structuredClone(settings);
  const effective = constrainPresentationTiming(settings, 2);
  const result = planReviewPresentationSequence({
    settings,
    mainDuration: 2,
    fragmentOffset: 0,
    includeBookends: true,
    rate: { numerator: 30, denominator: 1 },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected valid sequence');
  expect(effective.introControl!.plain.duration).toBe(2);
  expect(result.plan.visualEnvelope.fadeIn).toBe(effective.introControl!.plain.duration);
  expect(result.plan.audioEnvelope.fadeIn).toBe(2);
  expect(settings).toEqual(before);
});

it('scales a short pair before independently disabling the outgoing audio fade', async () => {
  const { constrainPresentationTiming } = await import('./presentation');
  const { planReviewPresentationSequence } = await import('../presentation-sequence');
  const settings = createNeutralPresentationSettings();
  settings.introControl = {
    mode: 'fade',
    plain: { enabled: true, duration: 2, audioFade: true },
    media: settings.fadeIn,
  };
  settings.outroControl = {
    mode: 'fade',
    plain: { enabled: true, duration: 2, audioFade: false },
    media: settings.fadeOut,
  };
  const effective = constrainPresentationTiming(settings, 2);
  expect(effective.introControl!.plain.duration).toBe(1);
  expect(effective.outroControl!.plain.duration).toBe(1);
  const result = planReviewPresentationSequence({
    settings,
    mainDuration: 2,
    fragmentOffset: 0,
    includeBookends: true,
    rate: { numerator: 30, denominator: 1 },
  });
  if (!result.ok) throw new Error('Expected valid sequence');
  expect(result.plan.audioEnvelope.fadeIn).toBe(result.plan.visualEnvelope.fadeIn);
  expect(result.plan.audioEnvelope.fadeOut).toBe(0);
  expect(
    Math.abs(result.plan.visualEnvelope.fadeIn - effective.introControl!.plain.duration)
  ).toBeLessThan(1 / 30);
  expect(settings.introControl.plain.duration).toBe(2);
  expect(settings.outroControl.plain.duration).toBe(2);
});
