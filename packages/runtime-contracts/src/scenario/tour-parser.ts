import { tourPaintSchema } from './tour-paint-schema';
import { z } from 'zod';
import { isPlainRecord } from '../validation/primitives';
import { isBoundedScenarioInput } from './input-bounds';
import { scenarioImageSourceSchema } from './image-source-schema';
import { GUIDE_LIMITS } from './limits';
import { TOUR_LIMITS, type TourDocument, type TourAction } from './types/tour';

const id = z
  .string()
  .min(1)
  .max(GUIDE_LIMITS.maxIdLength)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const label = z.string().max(GUIDE_LIMITS.maxLabelLength);
const text = z.string().max(TOUR_LIMITS.maxTextLength);
const fraction = z.number().finite().min(0).max(1);
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const duration = z.number().finite().positive().max(TOUR_LIMITS.maxDurationSeconds);
const point = z.object({ x: fraction, y: fraction }).strict();
const rect = point
  .extend({ width: fraction.gt(0), height: fraction.gt(0) })
  .strict()
  .refine((value) => value.x + value.width <= 1 && value.y + value.height <= 1);
const url = text.min(1).refine((value) => {
  if (
    /\s/u.test(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return false;
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
});

/** Closed navigation schema reused by authored controls and generated AI operations. */
export const tourActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('next') }).strict(),
  z.object({ kind: z.literal('previous') }).strict(),
  z.object({ kind: z.literal('end') }).strict(),
  z.object({ kind: z.literal('restart') }).strict(),
  z.object({ kind: z.literal('slide'), slideId: id }).strict(),
  z.object({ kind: z.literal('url'), url }).strict(),
]);
const textAppearance = z
  .object({
    surface: z
      .object({
        fillPaint: tourPaintSchema,
        surfaceCss: z.string().max(4000),
        textColor: color,
        width: z.number().finite().min(200).max(640),
        padding: z.number().finite().min(8).max(24),
        radius: z.number().finite().min(0).max(32),
      })
      .strict()
      .optional(),
    presentation: z.enum(['callout', 'caption-top', 'caption-bottom']),
    alignment: z.enum(['start', 'center', 'end']),
    placement: z.enum(['auto', 'top', 'bottom', 'left', 'right']),
  })
  .strict();
const narration = z
  .object({
    assetId: id,
    duration,
    trimStart: z.number().finite().min(0),
    trimEnd: duration,
    gain: z.number().finite().min(0).max(2),
    transcript: text,
  })
  .strict()
  .refine((value) => value.trimStart < value.trimEnd && value.trimEnd <= value.duration);
const objectNarration = narration
  .safeExtend({ trigger: z.enum(['activation', 'enter']) })
  .nullable()
  .optional();
const timing = z
  .object({
    mode: z.enum(['inherit', 'manual', 'auto']),
    holdSeconds: duration,
    truncateNarration: z.boolean(),
    autoplayTarget: id.nullable(),
  })
  .strict();
const image = z
  .object({
    assetId: id,
    galleryAssetId: id.nullable(),
    editDocumentId: id.nullable(),
    width: z.number().int().positive().max(GUIDE_LIMITS.maxDimension),
    height: z.number().int().positive().max(GUIDE_LIMITS.maxDimension),
    alt: text,
    source: scenarioImageSourceSchema,
  })
  .strict();

/** Per-object schemas are also the editor and AI parameter vocabulary. */
export const tourObjectSchemas = {
  hotspot: z
    .object({
      id,
      point,
      targetRect: rect.nullable(),
      label,
      text,
      action: tourActionSchema,
      appearance: textAppearance.nullable(),
      pulse: z.boolean(),
      narration: objectNarration,
    })
    .strict(),
  annotation: z
    .object({
      id,
      text,
      anchor: point.nullable(),
      appearance: textAppearance.nullable(),
      narration: objectNarration,
    })
    .strict(),
  mask: z
    .object({
      id,
      rect,
      kind: z.enum(['spotlight', 'highlight', 'blur', 'redact']),
      paint: tourPaintSchema.optional(),
      spotlightColor: color.optional(),
      spotlightOpacity: fraction.optional(),
      blurRadius: z.number().finite().min(1).max(80).optional(),
      color,
      opacity: fraction,
      narration: objectNarration,
    })
    .strict(),
  button: z.object({ id, label, action: tourActionSchema, narration: objectNarration }).strict(),
};
const imageSlide = z
  .object({
    kind: z.literal('image'),
    id,
    title: label,
    image: image.nullable(),
    origin: z.object({ stepId: id, blockId: id }).strict().nullable(),
    requiresTargetReview: z.boolean().optional(),
    fit: z.enum(['contain', 'cover']),
    camera: z
      .object({
        mode: z.enum(['inherit', 'off', 'auto', 'manual']),
        center: point,
        zoom: z.number().finite().min(1).max(TOUR_LIMITS.maxZoom),
      })
      .strict(),
    hotspots: z.array(tourObjectSchemas.hotspot).max(TOUR_LIMITS.maxHotspots),
    annotations: z.array(tourObjectSchemas.annotation).max(TOUR_LIMITS.maxAnnotations),
    masks: z.array(tourObjectSchemas.mask).max(TOUR_LIMITS.maxMasks),
    narration: narration.nullable(),
    timing,
  })
  .strict();
const navigationSlide = z
  .object({
    kind: z.literal('navigation'),
    id,
    title: label,
    description: text,
    background: z
      .object({ color, image: image.nullable(), paint: tourPaintSchema.optional() })
      .strict(),
    layout: z
      .object({
        width: z.number().finite().min(30).max(100),
        align: z.enum(['start', 'center', 'end']),
        vertical: z.enum(['start', 'center', 'end']),
        padding: z.number().finite().min(0).max(12),
        gap: z.number().finite().min(0).max(32),
        columns: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      })
      .strict()
      .optional(),
    buttons: z.array(tourObjectSchemas.button).max(TOUR_LIMITS.maxButtons),
    narration: narration.nullable(),
    timing,
  })
  .strict();

/** Structural schema; document admission additionally validates identity and navigation references. */
export const tourDocumentSchema = z
  .object({
    version: z.literal(1),
    audioResources: z
      .array(z.object({ assetId: id, duration, name: label }).strict())
      .max(TOUR_LIMITS.maxAudioResources)
      .optional(),
    id,
    stage: z.object({ aspect: z.enum(['16:9', '4:3', '9:16']), background: color }).strict(),
    style: z.object({ accent: color, text: color, surface: color, textAppearance }).strict(),
    playback: z
      .object({
        autoplay: z.boolean(),
        loop: z.boolean(),
        minimumHoldSeconds: duration,
        autoZoom: z.boolean(),
      })
      .strict(),
    transition: z
      .object({
        kind: z.enum(['none', 'fade', 'slide']),
        durationMs: z.number().int().min(0).max(2000),
        hotspotTravelMs: z.number().int().min(0).max(2000),
      })
      .strict(),
    slides: z
      .array(z.discriminatedUnion('kind', [imageSlide, navigationSlide]))
      .max(TOUR_LIMITS.maxSlides),
    endScreen: z
      .object({
        enabled: z.boolean(),
        title: label,
        description: text,
        button: z.object({ label, url }).strict().nullable(),
        restart: z.boolean(),
      })
      .strict(),
  })
  .strict();

/** Unsupported documents are never silently replaced with an empty tour. */
export type TourParseResult =
  | { status: 'ok'; document: TourDocument }
  | { status: 'invalid' }
  | { status: 'unsupported'; version: number };

/** Validates a detached tour with no storage, migration, media acquisition or navigation effects. */
export function parseTourDocument(value: unknown): TourParseResult {
  if (!isBoundedScenarioInput(value) || !isPlainRecord(value)) return { status: 'invalid' };
  const version = value['version'];
  if (typeof version === 'number' && Number.isSafeInteger(version) && version > 0 && version !== 1)
    return { status: 'unsupported', version };
  const result = tourDocumentSchema.safeParse(value);
  if (!result.success || !validReferences(result.data)) return { status: 'invalid' };
  return { status: 'ok', document: result.data };
}

function validReferences(document: TourDocument): boolean {
  const audio = new Map<string, number>();
  for (const resource of document.audioResources ?? []) {
    if (audio.has(resource.assetId)) return false;
    audio.set(resource.assetId, resource.duration);
  }
  for (const slide of document.slides) {
    const objects =
      slide.kind === 'image'
        ? [...slide.hotspots, ...slide.annotations, ...slide.masks]
        : slide.buttons;
    for (const target of [slide, ...objects]) {
      const voice = target.narration;
      if (!voice) continue;
      if (audio.has(voice.assetId) && audio.get(voice.assetId) !== voice.duration) return false;
      audio.set(voice.assetId, voice.duration);
    }
  }
  for (const slide of document.slides) {
    const image = slide.kind === 'image' ? slide.image : slide.background.image;
    if (image && audio.has(image.assetId)) return false;
  }
  const ids = new Set([document.id]);
  const slides = new Set(document.slides.map((slide) => slide.id));
  const claim = (value: string) => {
    if (ids.has(value)) return false;
    ids.add(value);
    return true;
  };
  const actionExists = (action: TourAction) =>
    action.kind !== 'slide' || slides.has(action.slideId);
  for (const slide of document.slides) {
    if (
      !claim(slide.id) ||
      (slide.timing.autoplayTarget !== null && !slides.has(slide.timing.autoplayTarget))
    )
      return false;
    if (slide.kind === 'navigation') {
      if (!slide.buttons.every((button) => claim(button.id) && actionExists(button.action)))
        return false;
    } else {
      if (!slide.hotspots.every((hotspot) => claim(hotspot.id) && actionExists(hotspot.action)))
        return false;
      if (![...slide.annotations, ...slide.masks].every((item) => claim(item.id))) return false;
    }
  }
  return true;
}
