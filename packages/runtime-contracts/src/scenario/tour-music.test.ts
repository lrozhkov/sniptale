import { expect, it } from 'vitest';
import { parseTourDocument } from './tour-parser';
import { createTourBackgroundMusic, type TourDocument } from './types/tour';
function document(): TourDocument {
  return {
    version: 1,
    id: 'tour',
    stage: { aspect: '16:9', background: '#000000' },
    style: {
      accent: '#ffffff',
      text: '#ffffff',
      surface: '#000000',
      textAppearance: { presentation: 'callout', alignment: 'start', placement: 'auto' },
    },
    playback: { autoplay: false, loop: false, minimumHoldSeconds: 4, autoZoom: true },
    transition: { kind: 'none', durationMs: 0, hotspotTravelMs: 0 },
    slides: [],
    endScreen: { enabled: false, title: '', description: '', button: null, restart: true },
  };
}
it('keeps legacy music absent and creates independent author defaults only on attachment', () => {
  const value = document();
  expect(parseTourDocument(value)).toEqual({ status: 'ok', document: value });
  const music = createTourBackgroundMusic({ assetId: 'music', duration: 4 });
  expect(music).toEqual({
    assetId: 'music',
    duration: 4,
    volume: 0.3,
    loop: true,
    ducking: { enabled: true, level: 0.25 },
  });
  music.ducking.level = 1;
  expect(createTourBackgroundMusic(music).ducking.level).toBe(0.25);
  for (const backgroundMusic of [null, music])
    expect(parseTourDocument({ ...value, backgroundMusic })).toEqual({
      status: 'ok',
      document: { ...value, backgroundMusic },
    });
});
it('rejects malformed music and conflicting media identity while permitting shared narration audio', () => {
  const value = document();
  const music = createTourBackgroundMusic({ assetId: 'audio', duration: 4 });
  for (const patch of [
    { volume: -0.1 },
    { volume: 1.1 },
    { volume: NaN },
    { duration: Infinity },
    { duration: 0 },
    { loop: 1 },
    { assetId: '' },
    { extra: true },
    { ducking: { enabled: true, level: 2 } },
    { ducking: { enabled: true, level: 0, extra: true } },
  ])
    expect(parseTourDocument({ ...value, backgroundMusic: { ...music, ...patch } }).status).toBe(
      'invalid'
    );
  value.backgroundMusic = music;
  value.audioResources = [{ assetId: 'audio', duration: 5, name: 'Conflict' }];
  expect(parseTourDocument(value).status).toBe('invalid');
  value.audioResources[0]!.duration = 4;
  expect(parseTourDocument(value).status).toBe('ok');
  value.slides = [
    {
      kind: 'navigation',
      id: 'slide',
      title: '',
      description: '',
      background: { color: '#000000', image: null },
      buttons: [],
      timing: { mode: 'auto', holdSeconds: 4, truncateNarration: false, autoplayTarget: null },
      narration: {
        assetId: 'audio',
        duration: 4,
        trimStart: 0,
        trimEnd: 4,
        gain: 1,
        transcript: '',
      },
    },
  ];
  expect(parseTourDocument(value).status).toBe('ok');
  value.slides[0]!.narration!.duration = 5;
  expect(parseTourDocument(value).status).toBe('invalid');
  value.slides[0]!.narration!.duration = 4;
  value.stage.image = {
    assetId: 'audio',
    width: 1,
    height: 1,
    alt: '',
    editDocumentId: null,
    galleryAssetId: null,
    source: { kind: 'import', filename: 'x.png' },
  };
  expect(parseTourDocument(value).status).toBe('invalid');
});
