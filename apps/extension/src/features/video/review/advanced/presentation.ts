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
type Image = Framing & {
  filename?: string;
  assetId: string;
  width: number;
  height: number;
  duration: number;
};
type Video = Framing & {
  filename?: string;
  assetId: string;
  source: NonNullable<ReturnType<typeof source>>;
  trim: { start: number; end: number };
  audio: { muted: boolean; gain: number };
};
type Slot =
  | { mode: 'none'; image?: Image; video?: Video }
  | { mode: 'image'; image: Image; video?: Video }
  | { mode: 'video'; image?: Image; video: Video };
type Fade = { enabled: boolean; duration: number; color?: string; audioFade?: boolean };
/** Independent authored edge; legacy scalar fields are fallback only when this is absent. */
export interface PresentationEdgeControl {
  mode: 'none' | 'fade' | 'media';
  plain: Fade;
  media: Fade;
}

/** Authored seconds and immutable references; dormant slot variants remain retained. */
export interface QuickEditPresentationSettings {
  introControl?: PresentationEdgeControl;
  outroControl?: PresentationEdgeControl;
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
    !fields(value, [
      'assetId',
      'filename',
      'width',
      'height',
      'duration',
      'fit',
      'fillColor',
      'crop',
    ]) ||
    (value['filename'] !== undefined &&
      (typeof value['filename'] !== 'string' || value['filename'].length > 512)) ||
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
        ...(typeof value['filename'] === 'string' ? { filename: value['filename'] } : {}),
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
    !fields(value, [
      'assetId',
      'filename',
      'source',
      'trim',
      'audio',
      'fit',
      'fillColor',
      'crop',
    ]) ||
    (value['filename'] !== undefined &&
      (typeof value['filename'] !== 'string' || value['filename'].length > 512)) ||
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
    ...(typeof value['filename'] === 'string' ? { filename: value['filename'] } : {}),
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
    !fields(value, ['enabled', 'duration', 'color', 'audioFade']) ||
    typeof value['enabled'] !== 'boolean' ||
    !isBoundedNumber(value['duration'], 0, 60) ||
    (value['color'] !== undefined && !opaqueColor(value['color'])) ||
    (value['audioFade'] !== undefined && typeof value['audioFade'] !== 'boolean')
  )
    return null;
  return {
    enabled: value['enabled'],
    duration: value['duration'],
    ...(value['color'] === undefined ? {} : { color: opaqueColor(value['color'])! }),
    ...(typeof value['audioFade'] === 'boolean' ? { audioFade: value['audioFade'] } : {}),
  };
}

/** Rejects malformed active or remembered fields; absence alone receives neutral defaults. */
export function parseQuickEditPresentationSettings(
  value: unknown
): QuickEditPresentationSettings | null {
  if (value === undefined) return createNeutralPresentationSettings();
  if (
    !isRecord(value) ||
    !fields(value, [
      'introControl',
      'outroControl',
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
  const introControl =
    value['introControl'] === undefined ? undefined : edgeControl(value['introControl']);
  const outroControl =
    value['outroControl'] === undefined ? undefined : edgeControl(value['outroControl']);
  if (introControl === null || outroControl === null) return null;
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
    ...(introControl ? { introControl } : {}),
    ...(outroControl ? { outroControl } : {}),
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

function edgeControl(value: unknown): PresentationEdgeControl | null {
  if (
    !isRecord(value) ||
    !fields(value, ['mode', 'plain', 'media']) ||
    (value['mode'] !== 'none' && value['mode'] !== 'fade' && value['mode'] !== 'media')
  )
    return null;
  const plain = fade(value['plain']);
  const media = fade(value['media']);
  return plain && media ? { mode: value['mode'], plain, media } : null;
}

/** Projects legacy combinations without mutating history or inventing authored operations. */
export function presentationEdgeControl(
  settings: QuickEditPresentationSettings,
  side: 'intro' | 'outro'
): PresentationEdgeControl {
  const authored = side === 'intro' ? settings.introControl : settings.outroControl;
  if (authored) return authored;
  const fade = side === 'intro' ? settings.fadeIn : settings.fadeOut;
  const legacy = {
    ...fade,
    color: fade.color ?? settings.color,
    audioFade: fade.audioFade ?? settings.audioFade,
  };
  const hasMedia = settings[side].mode !== 'none';
  return {
    mode: hasMedia ? 'media' : fade.enabled ? 'fade' : 'none',
    plain: { ...legacy, enabled: true },
    media: hasMedia
      ? legacy
      : { enabled: false, duration: 0.4, color: '#000000ff', audioFade: false },
  };
}

/** Runtime projection; retained assets and inactive settings stay in the authored document. */
export function resolvePresentationSettings(
  settings: QuickEditPresentationSettings
): QuickEditPresentationSettings {
  const result = { ...settings };
  for (const side of ['intro', 'outro'] as const) {
    const control = side === 'intro' ? settings.introControl : settings.outroControl;
    if (!control) continue;
    const key = side === 'intro' ? 'fadeIn' : 'fadeOut';
    result[key] = {
      ...(control.mode === 'media' ? control.media : control.plain),
      enabled:
        control.mode === 'fade' ||
        (control.mode === 'media' && settings[side].mode !== 'none' && control.media.enabled),
    };
    if (control.mode !== 'media') result[side] = { ...settings[side], mode: 'none' };
  }
  return result;
}

/** Bounds authored join controls to their available neighbours without adding montage time. */
export function constrainPresentationTiming(
  settings: QuickEditPresentationSettings,
  mainDuration: number
): QuickEditPresentationSettings {
  if (!Number.isFinite(mainDuration) || mainDuration <= 0) return settings;
  const active = resolvePresentationSettings(settings);
  const result = { ...settings };
  const span = (side: 'intro' | 'outro') => {
    const slot = active[side];
    return slot.mode === 'image'
      ? slot.image.duration
      : slot.mode === 'video'
        ? slot.video.trim.end - slot.video.trim.start
        : 0;
  };
  for (const side of ['intro', 'outro'] as const) {
    const length = span(side);
    const key = side === 'intro' ? 'introTransition' : 'outroTransition';
    const transition = result[key];
    if (length > 0 && transition)
      result[key] = {
        ...transition,
        before: Math.min(transition.before, side === 'intro' ? length : mainDuration),
        after: Math.min(transition.after, side === 'intro' ? mainDuration : length),
      };
    const controlKey = side === 'intro' ? 'introControl' : 'outroControl';
    const control = result[controlKey];
    if (control)
      result[controlKey] = {
        ...control,
        plain: { ...control.plain, duration: Math.min(control.plain.duration, mainDuration) },
        media:
          length > 0
            ? { ...control.media, duration: Math.min(control.media.duration, length) }
            : control.media,
      };
  }
  if (span('intro') > 0 && span('outro') > 0 && result.introTransition && result.outroTransition) {
    const requested = result.introTransition.after + result.outroTransition.before;
    if (requested > mainDuration) {
      result.introTransition = {
        ...result.introTransition,
        after: (result.introTransition.after * mainDuration) / requested,
      };
      result.outroTransition = {
        ...result.outroTransition,
        before: (result.outroTransition.before * mainDuration) / requested,
      };
    }
  }
  return constrainActiveFades(result, mainDuration + span('intro') + span('outro'));
}

/** Scale the active pair before audio switches are applied; dormant authoring is untouched. */
function constrainActiveFades(settings: QuickEditPresentationSettings, span: number) {
  if (!settings.introControl && !settings.outroControl) return settings;
  const active = resolvePresentationSettings(settings);
  const requested =
    (active.fadeIn.enabled ? active.fadeIn.duration : 0) +
    (active.fadeOut.enabled ? active.fadeOut.duration : 0);
  if (requested <= span) return settings;
  const result = { ...settings };
  for (const side of ['intro', 'outro'] as const) {
    const key = side === 'intro' ? 'introControl' : 'outroControl';
    const fadeKey = side === 'intro' ? 'fadeIn' : 'fadeOut';
    const fade = active[fadeKey];
    if (!fade.enabled) continue;
    const duration = (fade.duration * span) / requested;
    const control = settings[key];
    if (control) {
      const field = control.mode === 'media' ? 'media' : 'plain';
      result[key] = { ...control, [field]: { ...control[field], duration } };
    } else result[fadeKey] = { ...fade, duration };
  }
  return result;
}
