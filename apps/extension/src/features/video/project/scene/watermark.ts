import type { VideoProject, VideoProjectAsset } from '../types/model';
import { normalizePaintColor } from '@sniptale/foundation/paint';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isBoundedNumber } from '../validation/primitives';

import { watermarkAnchors as anchors, type QuickEditWatermarkSettings } from './watermark-types';
export type { QuickEditWatermarkSettings } from './watermark-types';

/** The caller supplies localized authored text once; this owner never reads UI locale state. */
export function createQuickEditWatermark(textSeed: string): QuickEditWatermarkSettings {
  if (!validWatermarkText(textSeed)) throw new Error('Invalid watermark text.');
  return {
    mode: 'none',
    layout: 'single',
    text: {
      value: textSeed,
      font: 'sans',
      weight: 'normal',
      size: 24 / 1080,
      color: '#ffffffb3',
      align: 'center',
      shadow: true,
      wrapWidth: 0.8,
    },
    placement: { anchor: 'bottom-right', margin: 0.02 },
    tile: { spacing: 0.08, rotation: -30 },
  };
}

/** Mode changes retain every previously authored setting and immutable image reference. */
export function setQuickEditWatermarkMode(
  previous: QuickEditWatermarkSettings | undefined,
  mode: QuickEditWatermarkSettings['mode'],
  textSeed: string
): QuickEditWatermarkSettings {
  return { ...(previous ?? createQuickEditWatermark(textSeed)), mode };
}

/** Reset active mode presentation, retaining the other mode and immutable image bytes. */
export function resetQuickEditWatermark(
  settings: QuickEditWatermarkSettings,
  textSeed: string
): QuickEditWatermarkSettings {
  if (settings.mode === 'none') return settings;
  const defaults = createQuickEditWatermark(textSeed);
  return {
    ...settings,
    layout: defaults.layout,
    placement: defaults.placement,
    tile: defaults.tile,
    ...(settings.mode === 'text' ? { text: defaults.text } : {}),
    ...(settings.mode === 'image' && settings.image
      ? { image: { ...settings.image, size: 0.2, opacity: 1 } }
      : {}),
  };
}

/** Explicit anchor selection replaces custom drag/numeric placement. */
export function setQuickEditWatermarkAnchor(
  settings: QuickEditWatermarkSettings,
  anchor: QuickEditWatermarkSettings['placement']['anchor']
): QuickEditWatermarkSettings {
  return { ...settings, placement: { anchor, margin: settings.placement.margin } };
}

function oneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value);
}

function onlyFields(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validWatermarkText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 400 &&
    Array.from(value).length <= 200 &&
    value.split('\n').length <= 3 &&
    Array.from(value).every((character) => {
      const code = character.codePointAt(0)!;
      return (
        (code === 10 || code >= 32) &&
        !(code >= 127 && code <= 159) &&
        !(code >= 0xd800 && code <= 0xdfff)
      );
    })
  );
}

function parseText(value: unknown): QuickEditWatermarkSettings['text'] | null {
  if (
    !isRecord(value) ||
    !onlyFields(value, [
      'value',
      'font',
      'weight',
      'size',
      'color',
      'align',
      'shadow',
      'wrapWidth',
      'strike',
      'italic',
    ])
  )
    return null;
  if (
    !validWatermarkText(value['value']) ||
    !oneOf(value['font'], ['sans', 'serif', 'mono']) ||
    !oneOf(value['weight'], ['normal', 'bold']) ||
    !oneOf(value['align'], ['left', 'center', 'right'])
  )
    return null;
  if (
    !isBoundedNumber(value['size'], 1 / 1080, 0.25) ||
    !isBoundedNumber(value['wrapWidth'], 0.05, 1) ||
    typeof value['shadow'] !== 'boolean' ||
    (value['strike'] !== undefined && typeof value['strike'] !== 'boolean') ||
    (value['italic'] !== undefined && typeof value['italic'] !== 'boolean')
  )
    return null;
  const color = typeof value['color'] === 'string' ? normalizePaintColor(value['color']) : null;
  if (!color) return null;
  return {
    value: value['value'],
    font: value['font'],
    weight: value['weight'],
    ...(value['strike'] === undefined ? {} : { strike: value['strike'] }),
    ...(value['italic'] === undefined ? {} : { italic: value['italic'] }),
    size: value['size'],
    color,
    align: value['align'],
    shadow: value['shadow'],
    wrapWidth: value['wrapWidth'],
  };
}

function parseImage(value: unknown): NonNullable<QuickEditWatermarkSettings['image']> | null {
  if (!isRecord(value) || !onlyFields(value, ['assetId', 'width', 'height', 'size', 'opacity']))
    return null;
  if (
    typeof value['assetId'] !== 'string' ||
    !/^project-asset:\S{1,242}$/u.test(value['assetId']) ||
    Array.from(value['assetId']).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  )
    return null;
  if (
    !isBoundedNumber(value['width'], 1, 4096) ||
    !isBoundedNumber(value['height'], 1, 4096) ||
    !Number.isInteger(value['width']) ||
    !Number.isInteger(value['height']) ||
    value['width'] * value['height'] > 16_000_000
  )
    return null;
  if (!isBoundedNumber(value['size'], 0.01, 1) || !isBoundedNumber(value['opacity'], 0, 1))
    return null;
  return {
    assetId: value['assetId'],
    width: value['width'],
    height: value['height'],
    size: value['size'],
    opacity: value['opacity'],
  };
}

function parsePlacement(value: unknown): QuickEditWatermarkSettings['placement'] | null {
  if (
    !isRecord(value) ||
    !onlyFields(value, ['anchor', 'margin', 'position']) ||
    !oneOf(value['anchor'], anchors) ||
    !isBoundedNumber(value['margin'], 0, 0.25)
  )
    return null;
  const position = value['position'];
  if (position === undefined) return { anchor: value['anchor'], margin: value['margin'] };
  if (
    !isRecord(position) ||
    !onlyFields(position, ['x', 'y']) ||
    !isBoundedNumber(position['x'], 0, 1) ||
    !isBoundedNumber(position['y'], 0, 1)
  )
    return null;
  return {
    anchor: value['anchor'],
    margin: value['margin'],
    position: { x: position['x'], y: position['y'] },
  };
}

function parseTile(value: unknown): QuickEditWatermarkSettings['tile'] | null {
  if (
    !isRecord(value) ||
    !onlyFields(value, ['spacing', 'rotation']) ||
    !isBoundedNumber(value['spacing'], 0, 1) ||
    !isBoundedNumber(value['rotation'], -180, 180)
  )
    return null;
  return { spacing: value['spacing'], rotation: value['rotation'] };
}

/** Strict boundary parser: malformed or unsupported settings reject the entire authored payload. */
export function parseQuickEditWatermark(value: unknown): QuickEditWatermarkSettings | null {
  if (
    !isRecord(value) ||
    !onlyFields(value, ['mode', 'layout', 'text', 'image', 'placement', 'tile']) ||
    !oneOf(value['mode'], ['none', 'text', 'image']) ||
    !oneOf(value['layout'], ['single', 'tiled'])
  )
    return null;
  const text = parseText(value['text']);
  const image = value['image'] === undefined ? undefined : parseImage(value['image']);
  const placement = parsePlacement(value['placement']);
  const tile = parseTile(value['tile']);
  if (!text || image === null || !placement || !tile) return null;
  return {
    mode: value['mode'],
    layout: value['layout'],
    text,
    ...(image ? { image } : {}),
    placement,
    tile,
  };
}

type Size = { width: number; height: number };
function assertSize(size: Size) {
  if (
    !isBoundedNumber(size.width, Number.MIN_VALUE, 1e9) ||
    !isBoundedNumber(size.height, Number.MIN_VALUE, 1e9)
  )
    throw new Error('Invalid watermark geometry.');
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const anchorFractions: Record<
  QuickEditWatermarkSettings['placement']['anchor'],
  readonly [number, number]
> = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

/** Uses exact painted bounds, including glyph overhang/shadow supplied by the shared draw owner. */
export function resolveQuickEditWatermarkBounds(
  settings: QuickEditWatermarkSettings,
  canvas: Size,
  painted: Size
) {
  assertSize(canvas);
  assertSize(painted);
  const margin = Math.min(canvas.width, canvas.height) * settings.placement.margin;
  const available = { width: canvas.width - 2 * margin, height: canvas.height - 2 * margin };
  const scale = Math.min(1, available.width / painted.width, available.height / painted.height);
  const width = painted.width * scale;
  const height = painted.height * scale;
  const [horizontal, vertical] = anchorFractions[settings.placement.anchor];
  const position = settings.placement.position;
  const x = position
    ? position.x * canvas.width - width / 2
    : margin + (available.width - width) * horizontal;
  const y = position
    ? position.y * canvas.height - height / 2
    : margin + (available.height - height) * vertical;
  return {
    x: clamp(x, margin, canvas.width - margin - width),
    y: clamp(y, margin, canvas.height - margin - height),
    width,
    height,
    scale,
  };
}

/** Rotated instances have a positive painted-edge gap; allocation and visible-instance ceilings are explicit. */
export function resolveQuickEditWatermarkTile(
  settings: QuickEditWatermarkSettings,
  canvas: Size,
  painted: Size
) {
  assertSize(canvas);
  assertSize(painted);
  const rotation = (settings.tile.rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));
  const width = painted.width * cosine + painted.height * sine;
  const height = painted.width * sine + painted.height * cosine;
  const gap = Math.max(1, Math.min(canvas.width, canvas.height) * settings.tile.spacing);
  const stepX = Math.ceil(width + gap);
  const stepY = Math.ceil(height + gap);
  const columns = Math.ceil(canvas.width / stepX) + 2;
  const rows = Math.ceil(canvas.height / stepY) + 2;
  const count = columns * rows;
  if (count > 4096 || stepX * stepY > 4_194_304) throw new Error('Watermark tile budget exceeded.');
  return { width, height, stepX, stepY, columns, rows, count, rotation };
}

/** Resolves a Native watermark reference within its declared project material graph. */
export function getVideoProjectWatermarkAsset(
  project: VideoProject
): VideoProjectAsset | undefined {
  const reference = project.watermark?.image?.assetId;
  if (!reference?.startsWith('project-asset:')) return undefined;
  const id = reference.slice('project-asset:'.length);
  return project.assets.find((asset) => asset.id === id && asset.type === 'IMAGE');
}
