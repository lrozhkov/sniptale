import { isRecord, isBoundedNumber } from '../validation/primitives';
import { isRecordingTelemetrySignal } from '../validation/recording-telemetry';
import { normalizePaintColor } from '@sniptale/foundation/paint';
import type {
  ReviewActionAudioPreset,
  ReviewActionAudioFamily,
  ReviewActionAudioSetting,
  ReviewActionAudioRef,
  ReviewClickAnimation,
  ReviewClickStyle,
  VideoProjectActionFeedback,
} from './types';

export const reviewActionAudioRefKey = (ref: ReviewActionAudioRef): string =>
  JSON.stringify([ref.kind, ref.id]);
const REVIEW_CLICK_LIMIT = 10_000;
export const REVIEW_CLICK_DEFAULT: Readonly<ReviewClickStyle> = {
  effect: 'off',
  color: '#ffffffcc',
  radius: 32,
  stroke: 2,
  opacity: 1,
  before: 0,
  after: 0.6,
  offset: 0,
  x: 0,
  y: 0,
  pulses: 1,
  easing: 'ease-out',
};

/** Bounds shared by authored controls and the persisted boundary. Times are result seconds. */
export const REVIEW_CLICK_BOUNDS = {
  radius: [2, 200],
  stroke: [0.5, 20],
  opacity: [0, 1],
  before: [0, 2],
  after: [0.05, 5],
  offset: [-2, 2],
  x: [-1, 1],
  y: [-1, 1],
  pulses: [1, 5],
} as const;

export function isReviewActionAudioPreset(value: unknown): value is ReviewActionAudioPreset {
  return (
    value === 'mouse-classic-v1' ||
    value === 'mouse-alternate-v1' ||
    value === 'mouse-soft-v1' ||
    value === 'keyboard-v1' ||
    value === 'typing-natural-v1' ||
    value === 'mouse-classic-paired-v2' ||
    value === 'mouse-soft-paired-v2' ||
    value === 'keyboard-recorded-v2' ||
    value === 'typing-recorded-v2'
  );
}

export function reviewActionAudioPresetFamily(
  preset: ReviewActionAudioPreset
): ReviewActionAudioFamily {
  if (preset === 'keyboard-v1' || preset === 'keyboard-recorded-v2') return 'keyboard';
  if (preset === 'typing-natural-v1' || preset === 'typing-recorded-v2') return 'typing';
  return 'mouse';
}

/** Missing legacy content stays absent; malformed/duplicate authored settings refuse admission. */
export function parseReviewActionAudio(
  raw: unknown
): ReviewActionAudioSetting[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 10_000) return null;
  const result: ReviewActionAudioSetting[] = [];
  const identities = new Set<string>();
  for (const value of raw) {
    const parsed = parseActionAudioSetting(value);
    if (!parsed) return null;
    const key = reviewActionAudioRefKey(parsed.ref);
    if (identities.has(key)) return null;
    identities.add(key);
    result.push(parsed);
  }
  return result.sort((left, right) => {
    const a = reviewActionAudioRefKey(left.ref),
      b = reviewActionAudioRefKey(right.ref);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function parseActionAudioRef(raw: unknown): ReviewActionAudioRef | null {
  if (!isRecord(raw) || Object.keys(raw).some((key) => key !== 'kind' && key !== 'id')) return null;
  const kind = raw['kind'],
    id = raw['id'];
  if (
    (kind !== 'action' && kind !== 'signal') ||
    typeof id !== 'string' ||
    !id.trim() ||
    id.length > 256
  )
    return null;
  return { kind, id };
}

function parseAudioPhases(
  raw: Record<string, unknown>
): Pick<
  ReviewActionAudioSetting,
  'downEnabled' | 'upEnabled' | 'includeRepeats' | 'downGain' | 'upGain'
> | null {
  if (
    ['downEnabled', 'upEnabled', 'includeRepeats'].some(
      (key) => raw[key] !== undefined && typeof raw[key] !== 'boolean'
    ) ||
    ['downGain', 'upGain'].some((key) => raw[key] !== undefined && !isBoundedNumber(raw[key], 0, 1))
  )
    return null;
  return {
    ...(typeof raw['downEnabled'] === 'boolean' ? { downEnabled: raw['downEnabled'] } : {}),
    ...(typeof raw['upEnabled'] === 'boolean' ? { upEnabled: raw['upEnabled'] } : {}),
    ...(typeof raw['includeRepeats'] === 'boolean'
      ? { includeRepeats: raw['includeRepeats'] }
      : {}),
    ...(typeof raw['downGain'] === 'number' ? { downGain: raw['downGain'] } : {}),
    ...(typeof raw['upGain'] === 'number' ? { upGain: raw['upGain'] } : {}),
  };
}

function parseActionAudioSetting(raw: unknown): ReviewActionAudioSetting | null {
  if (
    !isRecord(raw) ||
    Object.keys(raw).some(
      (key) =>
        ![
          'ref',
          'enabled',
          'presetId',
          'volume',
          'offset',
          'downEnabled',
          'upEnabled',
          'downGain',
          'upGain',
          'includeRepeats',
        ].includes(key)
    )
  )
    return null;
  const ref = parseActionAudioRef(raw['ref']);
  const presetId = raw['presetId'];
  const phases = parseAudioPhases(raw);
  if (
    !ref ||
    !phases ||
    typeof raw['enabled'] !== 'boolean' ||
    (presetId !== null && !isReviewActionAudioPreset(presetId)) ||
    (raw['enabled'] && presetId === null) ||
    !isBoundedNumber(raw['volume'], 0, 1) ||
    !isBoundedNumber(raw['offset'], -2, 2)
  )
    return null;
  return {
    ref,
    enabled: raw['enabled'],
    presetId,
    volume: raw['volume'],
    offset: raw['offset'],
    ...phases,
  };
}

/** Strict optional-content parser: legacy absence stays absent; invalid settings reject. */
export function parseReviewClickAnimations(
  raw: unknown
): ReviewClickAnimation[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > REVIEW_CLICK_LIMIT) return null;
  const result: ReviewClickAnimation[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const parsed = parseClick(item);
    if (!parsed || ids.has(parsed.id)) return null;
    ids.add(parsed.id);
    result.push(parsed);
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function parseClick(raw: unknown): ReviewClickAnimation | null {
  if (
    !isRecord(raw) ||
    typeof raw['id'] !== 'string' ||
    !raw['id'].trim() ||
    raw['id'].length > 256
  )
    return null;
  const effect = raw['effect'];
  const easing = raw['easing'];
  const color = typeof raw['color'] === 'string' ? normalizePaintColor(raw['color']) : null;
  if (
    !color ||
    !['off', 'ripple', 'press', 'glow', 'magnify'].some((value) => effect === value) ||
    !['linear', 'ease-out', 'ease-in-out'].some((value) => easing === value)
  )
    return null;
  const numbers = { ...REVIEW_CLICK_DEFAULT };
  for (const key of Object.keys(REVIEW_CLICK_BOUNDS) as (keyof typeof REVIEW_CLICK_BOUNDS)[]) {
    const value = raw[key];
    const [min, max] = REVIEW_CLICK_BOUNDS[key];
    if (!isBoundedNumber(value, min, max) || (key === 'pulses' && !Number.isInteger(value)))
      return null;
    numbers[key] = value;
  }
  if (
    (effect !== 'off' &&
      effect !== 'ripple' &&
      effect !== 'press' &&
      effect !== 'glow' &&
      effect !== 'magnify') ||
    (easing !== 'linear' && easing !== 'ease-out' && easing !== 'ease-in-out')
  )
    return null;
  const gestureAppearance = raw['gestureAppearance'];
  const area = raw['gestureArea'];
  let gestureArea: ReviewClickStyle['gestureArea'];
  if (
    gestureAppearance !== undefined &&
    gestureAppearance !== 'halo' &&
    gestureAppearance !== 'path' &&
    gestureAppearance !== 'area'
  )
    return null;
  if (area !== undefined) {
    const parsed = parseGestureArea(area);
    if (!parsed) return null;
    gestureArea = parsed;
  }
  const magnification = raw['magnification'];
  const lensShadow = raw['lensShadow'];
  const lensShape = raw['lensShape'];
  if (magnification !== undefined && !isBoundedNumber(magnification, 1, 3)) return null;
  if (lensShadow !== undefined && !isBoundedNumber(lensShadow, 0, 100)) return null;
  if (lensShape !== undefined && lensShape !== 'circle' && lensShape !== 'rounded') return null;
  return {
    id: raw['id'],
    ...numbers,
    effect,
    easing,
    color,
    ...(gestureAppearance === undefined ? {} : { gestureAppearance }),
    ...(gestureArea ? { gestureArea } : {}),
    ...(magnification === undefined ? {} : { magnification }),
    ...(lensShadow === undefined ? {} : { lensShadow }),
    ...(lensShape === undefined ? {} : { lensShape }),
  };
}

/** Bounded parser for both source snapshots and authored feedback, without a persistence side effect. */
export function parseVideoProjectActionFeedback(
  raw: unknown
): VideoProjectActionFeedback[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 10000) return null;
  const groups: VideoProjectActionFeedback[] = [];
  const ids = new Set<string>();
  let settingsCount = 0,
    signalCount = 0,
    styleCount = 0;
  for (const item of raw) {
    if (
      !isRecord(item) ||
      Object.keys(item).some(
        (key) =>
          !['recordingId', 'sourceInstanceId', 'settings', 'signals', 'gestureStyles'].includes(key)
      ) ||
      typeof item['recordingId'] !== 'string' ||
      !item['recordingId'] ||
      item['recordingId'].length > 256 ||
      typeof item['sourceInstanceId'] !== 'string' ||
      !item['sourceInstanceId'] ||
      item['sourceInstanceId'].length > 256
    )
      return null;
    const settings = parseReviewActionAudio(item['settings']);
    const styles = parseReviewClickAnimations(item['gestureStyles']);
    const signals = item['signals'];
    if (
      !settings ||
      styles === null ||
      !Array.isArray(signals) ||
      signals.length > 10000 ||
      !signals.every(isRecordingTelemetrySignal)
    )
      return null;
    settingsCount += settings.length;
    signalCount += signals.length;
    styleCount += styles?.length ?? 0;
    if (
      settingsCount > 10000 ||
      signalCount > 10000 ||
      styleCount > 10000 ||
      new Set(signals.map((signal) => signal.id)).size !== signals.length
    )
      return null;
    const key = JSON.stringify([item['recordingId'], item['sourceInstanceId']]);
    if (ids.has(key)) return null;
    ids.add(key);
    groups.push({
      recordingId: item['recordingId'],
      sourceInstanceId: item['sourceInstanceId'],
      settings,
      signals: signals.map((signal) => structuredClone(signal)),
      ...(styles ? { gestureStyles: styles } : {}),
    });
  }
  return groups;
}

function parseGestureArea(raw: unknown): NonNullable<ReviewClickStyle['gestureArea']> | null {
  if (
    !isRecord(raw) ||
    Object.keys(raw).some((key) => !['x', 'y', 'width', 'height'].includes(key))
  )
    return null;
  const x = raw['x'],
    y = raw['y'],
    width = raw['width'],
    height = raw['height'];
  if (
    !isBoundedNumber(x, 0, 1) ||
    !isBoundedNumber(y, 0, 1) ||
    !isBoundedNumber(width, 0, 1) ||
    !isBoundedNumber(height, 0, 1) ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 ||
    y + height > 1
  )
    return null;
  return { x, y, width, height };
}

/** Percentage controls retain a positive area and keep each edge inside the source plane. */
export function reviewGestureAreaBounds(
  area: NonNullable<ReviewClickStyle['gestureArea']>,
  key: 'x' | 'y' | 'width' | 'height'
) {
  const min = key === 'width' || key === 'height' ? 0.1 : 0;
  const opposite = key === 'x' ? 'width' : key === 'y' ? 'height' : key === 'width' ? 'x' : 'y';
  return { min, max: (1 - area[opposite]) * 100 };
}
