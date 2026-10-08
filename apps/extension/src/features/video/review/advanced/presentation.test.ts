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
