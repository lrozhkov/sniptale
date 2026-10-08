import { parseCutTransition, type ReviewCutTransition } from '../cut-transition';
import { normalizePaintColor } from '@sniptale/foundation/paint';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isBoundedNumber } from '../../project/validation/primitives';

type Framing = {
  fit: 'contain' | 'cover';
  fillColor: string;
  /** Object-position convention: -1 exposes start, +1 exposes end. */
  crop: { panX: number; panY: number };
};
type Image = Framing & { assetId: string; width: number; height: number; duration: number };
type Video = Framing & {
  assetId: string;
  source: NonNullable<ReturnType<typeof source>>;
  trim: { start: number; end: number };
  audio: { muted: boolean; gain: number };
};
type Slot =
  | { mode: 'none'; image?: Image; video?: Video }
  | { mode: 'image'; image: Image; video?: Video }
  | { mode: 'video'; image?: Image; video: Video };
type Fade = { enabled: boolean; duration: number };

/** Authored seconds and immutable references; dormant slot variants remain retained. */
export interface QuickEditPresentationSettings {
  fadeIn: Fade;
  fadeOut: Fade;
  color: string;
  /** Uses the requested visual edges, independently constrained to the audio sample span. */
  audioFade: boolean;
  intro: Slot;
  outro: Slot;
  introTransition?: ReviewCutTransition;
  outroTransition?: ReviewCutTransition;
}

/** Legacy omission is processing-neutral, including when advanced mode is selected. */
export function createNeutralPresentationSettings(): QuickEditPresentationSettings {
  return {
    fadeIn: { enabled: false, duration: 0.4 },
    fadeOut: { enabled: false, duration: 0.4 },
    color: '#000000ff',
    audioFade: false,
    intro: { mode: 'none' },
    outro: { mode: 'none' },
  };
}

/** Only the absent-workspace creation branch applies these authored defaults. */
export function createNewWorkspacePresentationSettings(): QuickEditPresentationSettings {
  const settings = createNeutralPresentationSettings();
  settings.fadeIn.enabled = true;
  settings.fadeOut.enabled = true;
  settings.introTransition = { type: 'dissolve', before: 0.2, after: 0.2 };
  settings.outroTransition = { type: 'dissolve', before: 0.2, after: 0.2 };
  return settings;
}

function fields(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function opaqueColor(value: unknown) {
  const color = typeof value === 'string' ? normalizePaintColor(value) : null;
  return color?.endsWith('ff') ? color : null;
}
function identity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    })
  );
}
function dimensions(width: unknown, height: unknown, axis: number, area: number) {
  return (
    isBoundedNumber(width, 1, axis) &&
    Number.isInteger(width) &&
    isBoundedNumber(height, 1, axis) &&
    Number.isInteger(height) &&
    width * height <= area
  );
}
function framing(value: Record<string, unknown>): Framing | null {
  const crop = value['crop'];
  const fillColor = opaqueColor(value['fillColor']);
  if (
    (value['fit'] !== 'contain' && value['fit'] !== 'cover') ||
    !fillColor ||
    !isRecord(crop) ||
    !fields(crop, ['panX', 'panY']) ||
    !isBoundedNumber(crop['panX'], -1, 1) ||
    !isBoundedNumber(crop['panY'], -1, 1)
  )
    return null;
  return { fit: value['fit'], fillColor, crop: { panX: crop['panX'], panY: crop['panY'] } };
}
function image(value: unknown): Image | null {
  if (
    !isRecord(value) ||
    !fields(value, ['assetId', 'width', 'height', 'duration', 'fit', 'fillColor', 'crop']) ||
    !identity(value['assetId']) ||
    !isBoundedNumber(value['width'], 1, 4096) ||
    !isBoundedNumber(value['height'], 1, 4096) ||
    !dimensions(value['width'], value['height'], 4096, 16_000_000) ||
    !isBoundedNumber(value['duration'], 0.1, 60)
  )
    return null;
  const frame = framing(value);
  return frame
    ? {
        ...frame,
        assetId: value['assetId'],
        width: value['width'],
        height: value['height'],
        duration: value['duration'],
      }
    : null;
}
function source(value: unknown) {
  if (
    !isRecord(value) ||
    !fields(value, ['duration', 'width', 'height', 'mimeType', 'size']) ||
    !isBoundedNumber(value['duration'], Number.MIN_VALUE, 3600) ||
    !isBoundedNumber(value['width'], 1, 16384) ||
    !isBoundedNumber(value['height'], 1, 16384) ||
    !dimensions(value['width'], value['height'], 16384, 40_000_000) ||
    !isBoundedNumber(value['size'], 1, 512 * 1024 * 1024) ||
    !Number.isInteger(value['size']) ||
    typeof value['mimeType'] !== 'string' ||
    value['mimeType'].length > 256 ||
    /[\r\n]/u.test(value['mimeType']) ||
    !/^video\/[a-z0-9.+-]+$/iu.test(value['mimeType'].split(';', 1)[0] ?? '')
  )
    return null;
  return {
    duration: value['duration'],
    width: value['width'],
    height: value['height'],
    size: value['size'],
    mimeType: value['mimeType'],
  };
}
function video(value: unknown): Video | null {
  if (
    !isRecord(value) ||
    !fields(value, ['assetId', 'source', 'trim', 'audio', 'fit', 'fillColor', 'crop']) ||
    !identity(value['assetId'])
  )
    return null;
  const media = source(value['source']);
  const frame = framing(value);
  const trim = value['trim'];
  const audio = value['audio'];
  if (
    !media ||
    !frame ||
    !isRecord(trim) ||
    !fields(trim, ['start', 'end']) ||
    !isBoundedNumber(trim['start'], 0, media.duration) ||
    !isBoundedNumber(trim['end'], 0, media.duration) ||
    trim['end'] <= trim['start'] ||
    !isRecord(audio) ||
    !fields(audio, ['muted', 'gain']) ||
    typeof audio['muted'] !== 'boolean' ||
    !isBoundedNumber(audio['gain'], 0, 2)
  )
    return null;
  return {
    ...frame,
    assetId: value['assetId'],
    source: media,
    trim: { start: trim['start'], end: trim['end'] },
    audio: { muted: audio['muted'], gain: audio['gain'] },
  };
}
function slot(value: unknown): Slot | null {
  if (!isRecord(value) || !fields(value, ['mode', 'image', 'video'])) return null;
  const rememberedImage = value['image'] === undefined ? undefined : image(value['image']);
  const rememberedVideo = value['video'] === undefined ? undefined : video(value['video']);
  if (rememberedImage === null || rememberedVideo === null) return null;
  const variants = {
    ...(rememberedImage ? { image: rememberedImage } : {}),
    ...(rememberedVideo ? { video: rememberedVideo } : {}),
  };
  if (value['mode'] === 'none') return { ...variants, mode: 'none' };
  if (value['mode'] === 'image' && rememberedImage)
    return { ...variants, mode: 'image', image: rememberedImage };
  if (value['mode'] === 'video' && rememberedVideo)
    return { ...variants, mode: 'video', video: rememberedVideo };
  return null;
}
function fade(value: unknown): Fade | null {
  if (
    !isRecord(value) ||
    !fields(value, ['enabled', 'duration']) ||
    typeof value['enabled'] !== 'boolean' ||
    !isBoundedNumber(value['duration'], 0, 60)
  )
    return null;
  return { enabled: value['enabled'], duration: value['duration'] };
}

/** Rejects malformed active or remembered fields; absence alone receives neutral defaults. */
export function parseQuickEditPresentationSettings(
  value: unknown
): QuickEditPresentationSettings | null {
  if (value === undefined) return createNeutralPresentationSettings();
  if (
    !isRecord(value) ||
    !fields(value, [
      'fadeIn',
      'fadeOut',
      'color',
      'audioFade',
      'intro',
      'outro',
      'introTransition',
      'outroTransition',
    ])
  )
    return null;
  const fadeIn = fade(value['fadeIn']);
  const fadeOut = fade(value['fadeOut']);
  const color = opaqueColor(value['color']);
  const intro = slot(value['intro']);
  const outro = slot(value['outro']);
  if (!fadeIn || !fadeOut || !color || !intro || !outro || typeof value['audioFade'] !== 'boolean')
    return null;
  const introTransition =
    value['introTransition'] === undefined
      ? undefined
      : parseCutTransition(value['introTransition']);
  const outroTransition =
    value['outroTransition'] === undefined
      ? undefined
      : parseCutTransition(value['outroTransition']);
  if (introTransition === null || outroTransition === null) return null;
  return {
    fadeIn,
    fadeOut,
    color,
    intro,
    outro,
    audioFade: value['audioFade'],
    ...(introTransition ? { introTransition } : {}),
    ...(outroTransition ? { outroTransition } : {}),
  };
}
