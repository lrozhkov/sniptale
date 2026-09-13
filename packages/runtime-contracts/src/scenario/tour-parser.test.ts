import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseTourDocument, tourDocumentSchema } from './tour-parser';
import { TOUR_HINT_SURFACE, type TourDocument, type TourImageSlide } from './types/tour';

function imageSlide(): TourImageSlide {
  return {
    kind: 'image',
    id: 'slide',
    title: 'Настройки',
    image: {
      assetId: 'asset',
      galleryAssetId: null,
      editDocumentId: null,
      width: 1600,
      height: 900,
      alt: 'Settings',
      source: { kind: 'import', filename: 'settings.png' },
    },
    origin: null,
    fit: 'contain',
    camera: { mode: 'auto', center: { x: 0.5, y: 0.5 }, zoom: 2 },
    hotspots: [
      {
        id: 'point',
        point: { x: 0.2, y: 0.3 },
        targetRect: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
        label: 'Open settings',
        text: 'Нажмите сюда',
        action: { kind: 'next' },
        appearance: null,
        pulse: true,
      },
    ],
    annotations: [
      {
        id: 'hint',
        text: 'Подсказка',
        anchor: null,
        appearance: { presentation: 'caption-bottom', alignment: 'start', placement: 'auto' },
      },
    ],
    masks: [
      {
        id: 'mask',
        rect: { x: 0, y: 0, width: 0.1, height: 0.1 },
        kind: 'highlight',
        color: '#ff9900',
        opacity: 0.5,
      },
    ],
    narration: {
      assetId: 'audio',
      duration: 12,
      trimStart: 1,
      trimEnd: 10,
      gain: 1,
      transcript: 'Настройки',
    },
    timing: { mode: 'auto', holdSeconds: 4, truncateNarration: false, autoplayTarget: null },
  };
}
function document(): TourDocument {
  return {
    version: 1,
    id: 'tour',
    stage: { aspect: '16:9', background: '#101820' },
    style: {
      accent: '#ff9900',
      text: '#ffffff',
      surface: '#202830',
      textAppearance: { presentation: 'callout', alignment: 'start', placement: 'auto' },
    },
    playback: { autoplay: false, loop: false, minimumHoldSeconds: 4, autoZoom: true },
    transition: { kind: 'fade', durationMs: 250, hotspotTravelMs: 300 },
    slides: [
      imageSlide(),
      {
        kind: 'navigation',
        id: 'menu',
        title: 'Оглавление',
        description: 'Выберите раздел',
        background: { color: '#202830', image: null },
        buttons: [{ id: 'button', label: 'В начало', action: { kind: 'slide', slideId: 'slide' } }],
        narration: null,
        timing: { mode: 'manual', holdSeconds: 4, truncateNarration: false, autoplayTarget: null },
      },
    ],
    endScreen: {
      enabled: true,
      title: 'Готово',
      description: 'Спасибо',
      button: { label: 'Подробнее', url: 'https://example.com/docs' },
      restart: true,
    },
  };
}
function mutateSlide(change: (slide: TourImageSlide) => void) {
  const value = document();
  const slide = imageSlide();
  change(slide);
  value.slides[0] = slide;
  return value;
}

describe('interactive tour boundary', () => {
  it('roundtrips detached scenes, narration, geometry and navigation', () => {
    const value = document();
    const parsed = parseTourDocument(value);
    expect(parsed).toEqual({ status: 'ok', document: value });
    if (parsed.status !== 'ok') throw new Error('Expected document');
    parsed.document.slides[0]!.title = 'changed';
    expect(value.slides[0]!.title).toBe('Настройки');
  });
  it('retains explanation surfaces and rejects out-of-range dimensions', () => {
    const value = document();
    value.style.textAppearance.surface = { ...TOUR_HINT_SURFACE, width: 280, radius: 20 };
    expect(parseTourDocument(value)).toEqual({ status: 'ok', document: value });
    for (const patch of [{ width: 0 }, { width: 641 }, { padding: 25 }, { radius: -1 }]) {
      value.style.textAppearance.surface = { ...TOUR_HINT_SURFACE, ...patch };
      expect(parseTourDocument(value).status).not.toBe('ok');
    }
  });
  it('allows unfinished image slots without pretending they are exportable', () => {
    expect(
      parseTourDocument(
        mutateSlide((slide) => {
          slide.image = null;
        })
      ).status
    ).toBe('ok');
  });
  it('accepts an empty editable document and no end screen', () => {
    const value = document();
    value.slides = [];
    value.endScreen.enabled = false;
    expect(parseTourDocument(value).status).toBe('ok');
  });
  it('distinguishes unsupported version from malformed input', () => {
    expect(parseTourDocument({ ...document(), version: 2 })).toEqual({
      status: 'unsupported',
      version: 2,
    });
    expect(parseTourDocument({ ...document(), version: '1' })).toEqual({ status: 'invalid' });
  });
  it.each([NaN, Infinity, -0.1, 1.1])('rejects invalid normalized point %s', (x) => {
    expect(
      parseTourDocument(
        mutateSlide((slide) => {
          slide.hotspots[0]!.point.x = x;
        })
      ).status
    ).toBe('invalid');
  });
  it('rejects rectangles crossing the source boundary', () => {
    expect(
      parseTourDocument(
        mutateSlide((slide) => {
          slide.hotspots[0]!.targetRect = { x: 0.9, y: 0, width: 0.2, height: 0.2 };
        })
      ).status
    ).toBe('invalid');
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///tmp/private',
    'https://user:pass@example.com',
    ' https://example.com',
    'https://example.com/\nunsafe',
  ])('rejects unsafe navigation %s', (url) => {
    const value = document();
    value.endScreen.button = { label: 'Visit', url };
    expect(parseTourDocument(value).status).toBe('invalid');
  });
  it('rejects deleted destination and autoplay target', () => {
    expect(
      parseTourDocument(
        mutateSlide((slide) => {
          slide.hotspots[0]!.action = { kind: 'slide', slideId: 'missing' };
        })
      ).status
    ).toBe('invalid');
    expect(
      parseTourDocument(
        mutateSlide((slide) => {
          slide.timing.autoplayTarget = 'missing';
        })
      ).status
    ).toBe('invalid');
  });
  it('allows authored cycles; playback chooses its finite autoplay route separately', () => {
    expect(
      parseTourDocument(
        mutateSlide((slide) => {
          slide.hotspots[0]!.action = { kind: 'slide', slideId: slide.id };
        })
      ).status
    ).toBe('ok');
  });
  it('rejects identity collisions across nested objects and slides', () => {
    for (const id of ['tour', 'slide', 'menu', 'hint', 'mask', 'button'])
      expect(
        parseTourDocument(
          mutateSlide((slide) => {
            slide.hotspots[0]!.id = id;
          })
        ).status
      ).toBe('invalid');
  });
  it('rejects zero and out-of-range audio trims', () => {
    expect(
      parseTourDocument(
        mutateSlide((slide) => {
          slide.narration!.trimEnd = 1;
        })
      ).status
    ).toBe('invalid');
    expect(
      parseTourDocument(
        mutateSlide((slide) => {
          slide.narration!.trimEnd = 13;
        })
      ).status
    ).toBe('invalid');
  });
  it('rejects excess counts, arbitrary properties and excessive text', () => {
    const value = document();
    value.slides = Array.from({ length: 301 }, (_, i) => ({ ...imageSlide(), id: `slide-${i}` }));
    expect(parseTourDocument(value).status).toBe('invalid');
    expect(parseTourDocument({ ...document(), script: 'alert(1)' }).status).toBe('invalid');
    expect(
      parseTourDocument(
        mutateSlide((slide) => {
          slide.annotations[0]!.text = 'a'.repeat(4001);
        })
      ).status
    ).toBe('invalid');
  });
  it('rejects cyclic, accessor and nonplain input before schema evaluation', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(parseTourDocument(cyclic).status).toBe('invalid');
    let called = false;
    const getter = Object.defineProperty({}, 'version', {
      enumerable: true,
      get: () => {
        called = true;
        return 1;
      },
    });
    expect(parseTourDocument(getter).status).toBe('invalid');
    expect(called).toBe(false);
    expect(parseTourDocument(new Date()).status).toBe('invalid');
  });
  it('retains video evidence but rejects action outside captured source time', () => {
    const value = mutateSlide((slide) => {
      slide.image!.source = {
        kind: 'video-frame',
        recordingId: 'recording',
        filename: 'recording.webm',
        timeSeconds: 3,
        action: {
          id: 'event',
          kind: 'CLICK',
          time: 2,
          duration: 2,
          label: 'Open',
          point: { x: 0.2, y: 0.3 },
          target: null,
        },
      };
    });
    expect(parseTourDocument(value).status).toBe('ok');
    const image = value.slides[0];
    if (image?.kind !== 'image' || image.image?.source.kind !== 'video-frame')
      throw new Error('Expected video');
    image.image.source.timeSeconds = 5;
    expect(parseTourDocument(value).status).toBe('invalid');
  });
  it('exports the same structural vocabulary to JSON schema without executable content', () => {
    const schema = z.toJSONSchema(tourDocumentSchema);
    const serialized = JSON.stringify(schema);
    expect(serialized).toContain('hotspotTravelMs');
    expect(serialized).toContain('autoplayTarget');
    expect(serialized).toContain('caption-top');
  });
});

it('preserves explicit target-review state and rejects non-boolean values', () => {
  const tour = document();
  const slide = tour.slides[0];
  if (slide?.kind !== 'image') throw new Error('Missing image fixture');
  slide.requiresTargetReview = true;
  const parsed = parseTourDocument(tour);
  expect(parsed.status).toBe('ok');
  if (parsed.status === 'ok')
    expect(parsed.document.slides[0]).toMatchObject({ requiresTargetReview: true });
  expect(
    parseTourDocument({ ...tour, slides: [{ ...slide, requiresTargetReview: 'false' }] }).status
  ).toBe('invalid');
});

it('admits independent audio materials and preserves per-object activation semantics', () => {
  const tour = document();
  const slide = imageSlide();
  const voice = { ...slide.narration!, trigger: 'activation' };
  const value = {
    ...tour,
    audioResources: [{ assetId: 'audio', duration: 12, name: 'Voice.wav' }],
    slides: [{ ...slide, hotspots: slide.hotspots.map((h) => ({ ...h, narration: voice })) }],
  };
  expect(parseTourDocument(value)).toEqual({ status: 'ok', document: value });
  expect(
    parseTourDocument({
      ...value,
      audioResources: [{ assetId: 'audio', duration: -1, name: 'Bad' }],
    }).status
  ).toBe('invalid');
});

it('roundtrips narration on all object kinds and rejects conflicting resources or invalid triggers', () => {
  const value = document();
  const slide = value.slides[0]!;
  const menu = value.slides[1]!;
  if (slide.kind !== 'image' || menu.kind !== 'navigation') throw Error('fixture');
  const voice = { ...slide.narration!, trigger: 'enter' as const };
  for (const object of [...slide.hotspots, ...slide.annotations, ...slide.masks, ...menu.buttons])
    object.narration = voice;
  expect(parseTourDocument(value)).toEqual({ status: 'ok', document: value });
  expect(
    parseTourDocument({
      ...value,
      audioResources: [{ assetId: 'audio', duration: 9, name: 'Mismatch' }],
    }).status
  ).toBe('invalid');
  expect(
    parseTourDocument({
      ...value,
      audioResources: [
        { assetId: 'audio', duration: 12, name: 'A' },
        { assetId: 'audio', duration: 12, name: 'B' },
      ],
    }).status
  ).toBe('invalid');
  const invalid = {
    ...value,
    slides: [
      {
        ...slide,
        annotations: [{ ...slide.annotations[0], narration: { ...voice, trigger: 'hover' } }],
      },
    ],
  };
  expect(parseTourDocument(invalid).status).toBe('invalid');
});

it('retains bounded navigation composition and structured paint in the published schema', () => {
  const tour = document();
  const slide = tour.slides.find((entry) => entry.kind === 'navigation')!;
  if (slide.kind !== 'navigation') throw new Error('navigation fixture');
  slide.layout = { width: 60, align: 'end', vertical: 'start', padding: 8, gap: 16, columns: 2 };
  slide.background.paint = {
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 45,
      interpolation: 'srgb',
      repeat: { enabled: false, span: 1 },
      stops: [
        { id: 'one', color: '#111827ff', position: 0, midpoint: 0.5 },
        { id: 'two', color: '#2563ebff', position: 1, midpoint: 0.5 },
      ],
    },
  };
  expect(parseTourDocument(tour)).toEqual({ status: 'ok', document: tour });
  expect(JSON.stringify(z.toJSONSchema(tourDocumentSchema))).toContain('midpoint');
  const invalid = structuredClone(tour);
  const candidate = invalid.slides.find((entry) => entry.kind === 'navigation')!;
  if (candidate.kind !== 'navigation' || !candidate.layout) throw new Error('navigation fixture');
  candidate.layout.width = 101;
  expect(parseTourDocument(invalid).status).toBe('invalid');
  candidate.layout.width = 60;
  candidate.background.paint = { kind: 'solid', color: 'url(https://example.com)' };
  expect(parseTourDocument(invalid).status).toBe('invalid');
});

it('validates independent mask effect parameters for editor and generated AI operations', () => {
  const schema = tourDocumentSchema.shape.slides;
  const slide = imageSlide();
  slide.masks[0] = {
    ...slide.masks[0]!,
    kind: 'blur',
    blurRadius: 20,
    spotlightColor: '#111827',
    spotlightOpacity: 0.6,
    paint: { kind: 'solid', color: '#f97316' },
  };
  expect(schema.safeParse([slide]).success).toBe(true);
  for (const blurRadius of [0, 81, Infinity]) {
    expect(
      schema.safeParse([{ ...slide, masks: [{ ...slide.masks[0], blurRadius }] }]).success
    ).toBe(false);
  }
  expect(
    schema.safeParse([
      { ...slide, masks: [{ ...slide.masks[0], spotlightColor: 'url(https://example.com)' }] },
    ]).success
  ).toBe(false);
});
