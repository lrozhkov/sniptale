import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseTourDocument, tourDocumentSchema } from './tour-parser';
import { type TourDocument, type TourImageSlide } from './types/tour';

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
