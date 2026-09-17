import { parsePaint, normalizePaintColor } from '@sniptale/foundation/paint';
import { isBoundedNumber, isUnitInterval } from '../../project/validation/primitives';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
  type QuickEditAdvancedState,
  type QuickEditAudioClip,
  type QuickEditAudioState,
  type QuickEditBackgroundLayout,
  type QuickEditBackgroundSettings,
  type QuickEditCameraTransform,
  type QuickEditOriginalAudio,
  type QuickEditTrackVisibility,
  type QuickEditUiState,
  type QuickEditZoomRegion,
  type QuickEditZoomState,
  type QuickEditZoomTransition,
} from './types';
import { createQuickEditAdvancedState } from './defaults';

/** Renderer-consistent camera magnification bounds, matching video project scale limits. */
const MAX_QUICK_EDIT_CAMERA_SCALE = 4;
const MIN_QUICK_EDIT_CAMERA_SCALE = 1;
const MAX_QUICK_EDIT_ZOOM_REGIONS = 512;
const MAX_QUICK_EDIT_AUDIO_CLIPS = 512;
const MAX_QUICK_EDIT_OFFSET_MS = 86_400_000;
const MAX_QUICK_EDIT_TRANSITION_MS = 60_000;
const MAX_QUICK_EDIT_BACKGROUND_SIZE = 4_096;
const MAX_QUICK_EDIT_CLIP_VOLUME = 2;

const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;

function parseBoundedArray<T>(
  value: unknown,
  maxItems: number,
  parse: (entry: unknown) => T | null
): T[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const parsed: T[] = [];
  for (const entry of value) {
    const item = parse(entry);
    if (!item) return null;
    parsed.push(item);
  }
  return parsed;
}

function parseTrackVisibility(value: unknown): QuickEditTrackVisibility | null {
  if (
    !isRecord(value) ||
    typeof value['actions'] !== 'boolean' ||
    typeof value['zoom'] !== 'boolean' ||
    typeof value['audio'] !== 'boolean'
  )
    return null;
  return { actions: value['actions'], zoom: value['zoom'], audio: value['audio'] };
}

function parseUiState(value: unknown): QuickEditUiState | null {
  if (!isRecord(value) || (value['mode'] !== 'basic' && value['mode'] !== 'advanced')) return null;
  const tracks = parseTrackVisibility(value['tracks']);
  if (!tracks) return null;
  return { mode: value['mode'], tracks };
}

function parseZoomTransition(value: unknown): QuickEditZoomTransition | null {
  if (
    !isRecord(value) ||
    (value['type'] !== 'none' && value['type'] !== 'linear' && value['type'] !== 'ease-in-out') ||
    !isBoundedNumber(value['durationMs'], 0, MAX_QUICK_EDIT_TRANSITION_MS)
  )
    return null;
  return { type: value['type'], durationMs: value['durationMs'] };
}

function parseCameraTransform(value: unknown): QuickEditCameraTransform | null {
  if (
    !isRecord(value) ||
    !isBoundedNumber(value['scale'], MIN_QUICK_EDIT_CAMERA_SCALE, MAX_QUICK_EDIT_CAMERA_SCALE) ||
    !isUnitInterval(value['centerX']) ||
    !isUnitInterval(value['centerY'])
  )
    return null;
  return { scale: value['scale'], centerX: value['centerX'], centerY: value['centerY'] };
}

function parseZoomRegion(value: unknown): QuickEditZoomRegion | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !isBoundedNumber(value['startMs'], 0, MAX_QUICK_EDIT_OFFSET_MS) ||
    !isBoundedNumber(value['endMs'], 0, MAX_QUICK_EDIT_OFFSET_MS) ||
    value['startMs'] >= value['endMs']
  )
    return null;
  const transform = parseCameraTransform(value['transform']);
  const enter = parseZoomTransition(value['enter']);
  const exit = parseZoomTransition(value['exit']);
  if (!transform || !enter || !exit) return null;
  return {
    id: value['id'],
    startMs: value['startMs'],
    endMs: value['endMs'],
    transform,
    enter,
    exit,
  };
}

/** Persisted regions never overlap; adjacency is allowed so transitions can touch boundaries. */
function parseZoomRegions(value: unknown): QuickEditZoomRegion[] | null {
  const regions = parseBoundedArray(value, MAX_QUICK_EDIT_ZOOM_REGIONS, parseZoomRegion);
  if (!regions) return null;
  const ids = new Set<string>();
  let previous: QuickEditZoomRegion | null = null;
  for (const region of regions) {
    if (ids.has(region.id)) return null;
    if (previous && region.startMs < previous.endMs) return null;
    ids.add(region.id);
    previous = region;
  }
  return regions;
}

function parseZoomState(value: unknown): QuickEditZoomState | null {
  if (!isRecord(value) || typeof value['enabled'] !== 'boolean') return null;
  const regions = parseZoomRegions(value['regions']);
  if (!regions) return null;
  return { enabled: value['enabled'], regions };
}

function parseBackgroundLayout(value: unknown): QuickEditBackgroundLayout | null {
  if (
    !isRecord(value) ||
    !isBoundedNumber(value['padding'], 0, MAX_QUICK_EDIT_BACKGROUND_SIZE) ||
    !isBoundedNumber(value['cornerRadius'], 0, MAX_QUICK_EDIT_BACKGROUND_SIZE)
  )
    return null;
  return { padding: value['padding'], cornerRadius: value['cornerRadius'] };
}

function parseBackgroundSettings(value: unknown): QuickEditBackgroundSettings | null {
  if (!isRecord(value)) return null;
  if (value['enabled'] === false) return { enabled: false };
  if (value['enabled'] !== true) return null;
  const layout = parseBackgroundLayout(value['layout']);
  if (!layout) return null;
  if (value['type'] === 'solid') {
    const color = typeof value['color'] === 'string' ? normalizePaintColor(value['color']) : null;
    return color ? { enabled: true, type: 'solid', color, layout } : null;
  }
  if (value['type'] === 'gradient') {
    const paint = parsePaint({ kind: 'gradient', gradient: value['gradient'] });
    if (!paint || paint.kind !== 'gradient') return null;
    return { enabled: true, type: 'gradient', gradient: paint.gradient, layout };
  }
  if (value['type'] === 'image') {
    return identity(value['assetId']) &&
      (value['imageFit'] === 'cover' || value['imageFit'] === 'contain')
      ? {
          enabled: true,
          type: 'image',
          assetId: value['assetId'],
          imageFit: value['imageFit'],
          layout,
        }
      : null;
  }
  return null;
}

function parseAudioClip(value: unknown): QuickEditAudioClip | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !identity(value['assetId']) ||
    !isBoundedNumber(value['timelineStartMs'], 0, MAX_QUICK_EDIT_OFFSET_MS) ||
    !isBoundedNumber(value['sourceOffsetMs'], 0, MAX_QUICK_EDIT_OFFSET_MS) ||
    !isBoundedNumber(value['durationMs'], 1, MAX_QUICK_EDIT_OFFSET_MS) ||
    !isBoundedNumber(value['volume'], 0, MAX_QUICK_EDIT_CLIP_VOLUME) ||
    typeof value['muted'] !== 'boolean' ||
    !isBoundedNumber(value['fadeInMs'], 0, MAX_QUICK_EDIT_TRANSITION_MS) ||
    !isBoundedNumber(value['fadeOutMs'], 0, MAX_QUICK_EDIT_TRANSITION_MS)
  )
    return null;
  return {
    id: value['id'],
    assetId: value['assetId'],
    timelineStartMs: value['timelineStartMs'],
    sourceOffsetMs: value['sourceOffsetMs'],
    durationMs: value['durationMs'],
    volume: value['volume'],
    muted: value['muted'],
    fadeInMs: value['fadeInMs'],
    fadeOutMs: value['fadeOutMs'],
  };
}

function parseAudioClips(value: unknown): QuickEditAudioClip[] | null {
  const clips = parseBoundedArray(value, MAX_QUICK_EDIT_AUDIO_CLIPS, parseAudioClip);
  if (!clips) return null;
  const ids = new Set<string>();
  for (const clip of clips) {
    if (ids.has(clip.id)) return null;
    ids.add(clip.id);
  }
  return clips;
}

function parseOriginalAudio(value: unknown): QuickEditOriginalAudio | null {
  if (
    !isRecord(value) ||
    typeof value['muted'] !== 'boolean' ||
    !isBoundedNumber(value['volume'], 0, MAX_QUICK_EDIT_CLIP_VOLUME)
  )
    return null;
  return { muted: value['muted'], volume: value['volume'] };
}

function parseAudioState(value: unknown): QuickEditAudioState | null {
  if (!isRecord(value)) return null;
  const original = parseOriginalAudio(value['original']);
  const voiceover = parseAudioClips(value['voiceover']);
  const music = parseAudioClips(value['music']);
  if (!original || !voiceover || !music) return null;
  return { original, voiceover, music };
}

/**
 * Single load point for persisted advanced quick-editor state: absent legacy data becomes
 * defaults, and any malformed field rejects the whole record at the workspace boundary.
 */
export function loadQuickEditAdvancedState(raw: unknown): QuickEditAdvancedState | null {
  if (raw === undefined) return createQuickEditAdvancedState();
  if (!isRecord(raw) || raw['schemaVersion'] !== QUICK_EDIT_ADVANCED_SCHEMA_VERSION) return null;
  const ui = parseUiState(raw['ui']);
  const zoom = parseZoomState(raw['zoom']);
  const background = parseBackgroundSettings(raw['background']);
  const audio = parseAudioState(raw['audio']);
  if (!ui || !zoom || !background || !audio) return null;
  return {
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    ui,
    zoom,
    background,
    audio,
  };
}
