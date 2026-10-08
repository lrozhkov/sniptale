import { parseQuickEditWatermark } from './watermark';
import { parseReviewSpeechTranscript } from '../speech-validation';
import { parseReviewKeyAnimations } from './key-animation';
import { parseQuickEditPerspective, parseQuickEditDepth } from './spatial';
import { parseReviewClickAnimations } from './click-animation';
import { parseQuickEditBorder } from './border';
import { quickEditFocusConflicts } from './focus-layout';
import { parseOriginalAudioRanges } from './original-audio';
import { parseVoiceoverAnchors, parseVoiceoverSegments } from '../voiceover-validation';
import { parseQuickEditSpotlight } from './focus';
import { parsePaint, normalizePaintColor } from '@sniptale/foundation/paint';
import { isBoundedNumber, isUnitInterval } from '../../project/validation/primitives';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
  QUICK_EDIT_ADVANCED_SCHEMA_V1,
  type QuickEditAdvancedContent,
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
import { parseQuickEditCanvas } from './canvas';
import { parseWindowHeader } from '../../../browser-frame/header';
import { parseQuickEditWebcam } from './webcam';
import { createQuickEditAdvancedState } from './defaults';
import { migrateQuickEditAdvancedV1 } from './migration';
import type { ReviewTimeSegment } from '../timeline';

/** Unreleased text-only headers cannot render with the new artwork; retain the rest of the edit. */
function parseStoredWindowHeader(value: unknown) {
  if (value === undefined) return undefined;
  if (
    isRecord(value) &&
    value['kind'] === 'browser' &&
    Object.keys(value).every((key) => key === 'kind' || key === 'title' || key === 'url') &&
    typeof value['title'] === 'string' &&
    value['title'].length <= 512 &&
    !/[\uD800-\uDFFF]/u.test(value['title']) &&
    (value['url'] === undefined ||
      (typeof value['url'] === 'string' &&
        value['url'].length <= 2048 &&
        !/[\uD800-\uDFFF]/u.test(value['url'])))
  )
    return undefined;
  return parseWindowHeader(value);
}

/** Renderer-consistent camera magnification bounds, matching video project scale limits. */
const MAX_QUICK_EDIT_CAMERA_SCALE = 4;
const MIN_QUICK_EDIT_CAMERA_SCALE = 1;
const MAX_QUICK_EDIT_ZOOM_REGIONS = 512;
const MAX_QUICK_EDIT_AUDIO_CLIPS = 512;
/** Quick-editor timeline coordinates are seconds, bounded like video project durations. */
const MAX_QUICK_EDIT_TIME = 86_400;
const MAX_QUICK_EDIT_TRANSITION = 60;
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
    typeof value['audio'] !== 'boolean' ||
    (value['webcam'] !== undefined && typeof value['webcam'] !== 'boolean')
  )
    return null;
  return {
    actions: value['actions'],
    zoom: value['zoom'],
    audio: value['audio'],
    ...(value['webcam'] === undefined ? {} : { webcam: value['webcam'] }),
  };
}

function parseUiState(value: unknown): QuickEditUiState | null {
  if (!isRecord(value) || (value['mode'] !== 'basic' && value['mode'] !== 'advanced')) return null;
  const initialized = value['advancedTracksInitialized'];
  if (initialized !== undefined && typeof initialized !== 'boolean') return null;
  const tracks = parseTrackVisibility(value['tracks']);
  if (!tracks) return null;
  // Pre-overlay workspaces omit the display toggle; missing or invalid falls back on.
  return {
    mode: value['mode'],
    ...(initialized === undefined ? {} : { advancedTracksInitialized: initialized }),
    tracks,
    overlaysVisible: value['overlaysVisible'] === false ? false : true,
  };
}

function parseZoomTransition(value: unknown): QuickEditZoomTransition | null {
  if (
    !isRecord(value) ||
    (value['type'] !== 'none' && value['type'] !== 'linear' && value['type'] !== 'ease-in-out') ||
    !isBoundedNumber(value['duration'], 0, MAX_QUICK_EDIT_TRANSITION)
  )
    return null;
  return { type: value['type'], duration: value['duration'] };
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

function parseMotionBlur(value: unknown): QuickEditZoomRegion['motionBlur'] | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const result: NonNullable<QuickEditZoomRegion['motionBlur']> = {};
  for (const phase of ['enter', 'exit', 'link'] as const) {
    const setting = value[phase];
    if (setting === undefined) continue;
    if (
      !isRecord(setting) ||
      typeof setting['enabled'] !== 'boolean' ||
      !isBoundedNumber(setting['strength'], 0, 1)
    )
      return null;
    result[phase] = { enabled: setting['enabled'], strength: setting['strength'] };
  }
  return result;
}

function parseZoomRegion(value: unknown): QuickEditZoomRegion | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !isBoundedNumber(value['start'], 0, MAX_QUICK_EDIT_TIME) ||
    !isBoundedNumber(value['end'], 0, MAX_QUICK_EDIT_TIME) ||
    value['start'] >= value['end']
  )
    return null;
  const perspective = parseQuickEditPerspective(value['perspective']);
  const depthOfField = parseQuickEditDepth(value['depthOfField']);
  if (perspective === null || depthOfField === null) return null;
  const motionBlur = parseMotionBlur(value['motionBlur']);
  if (motionBlur === null) return null;
  const spotlight =
    value['spotlight'] === undefined ? undefined : parseQuickEditSpotlight(value['spotlight']);
  const border = value['border'] === undefined ? undefined : parseQuickEditBorder(value['border']);
  if (
    spotlight === null ||
    border === null ||
    (spotlight && border) ||
    (border && value['linkTo'] !== undefined)
  )
    return null;
  const transform = parseCameraTransform(value['transform']);
  const enter = parseZoomTransition(value['enter']);
  const exit = parseZoomTransition(value['exit']);
  if (!transform || !enter || !exit) return null;
  if (value['linkTo'] !== undefined && !identity(value['linkTo'])) return null;
  const sourceAnchor = value['sourceAnchor'];
  if (
    sourceAnchor !== undefined &&
    (!isRecord(sourceAnchor) ||
      !isBoundedNumber(sourceAnchor['start'], 0, MAX_QUICK_EDIT_TIME) ||
      !isBoundedNumber(sourceAnchor['end'], 0, MAX_QUICK_EDIT_TIME) ||
      sourceAnchor['start'] >= sourceAnchor['end'])
  )
    return null;
  if (
    value['linkEasing'] !== undefined &&
    value['linkEasing'] !== 'linear' &&
    value['linkEasing'] !== 'ease-in-out'
  )
    return null;
  return {
    ...(perspective ? { perspective } : {}),
    ...(depthOfField ? { depthOfField } : {}),
    ...(motionBlur ? { motionBlur } : {}),
    ...(spotlight ? { spotlight } : {}),
    ...(border ? { border } : {}),
    id: value['id'],
    start: value['start'],
    end: value['end'],
    ...(isRecord(sourceAnchor) &&
    typeof sourceAnchor['start'] === 'number' &&
    typeof sourceAnchor['end'] === 'number'
      ? { sourceAnchor: { start: sourceAnchor['start'], end: sourceAnchor['end'] } }
      : {}),
    transform,
    enter,
    exit,
    ...(identity(value['linkTo']) ? { linkTo: value['linkTo'] } : {}),
    ...(value['linkEasing'] === 'linear' || value['linkEasing'] === 'ease-in-out'
      ? { linkEasing: value['linkEasing'] }
      : {}),
    ...(typeof value['dormant'] === 'boolean' ? { dormant: value['dormant'] } : {}),
  };
}

/**
 * Persisted active regions never overlap; adjacency is allowed so transitions can touch
 * boundaries. Dormant placements keep unproven source-time values and are exempt.
 */
function parseZoomRegions(value: unknown): QuickEditZoomRegion[] | null {
  const regions = parseBoundedArray(value, MAX_QUICK_EDIT_ZOOM_REGIONS, parseZoomRegion);
  if (!regions) return null;
  const ids = new Set<string>();
  for (const region of regions) {
    if (ids.has(region.id) || quickEditFocusConflicts(regions, region)) return null;
    ids.add(region.id);
  }
  return regions;
}

function parseZoomState(value: unknown, allowBorder: boolean): QuickEditZoomState | null {
  if (!isRecord(value) || typeof value['enabled'] !== 'boolean') return null;
  const regions = parseZoomRegions(value['regions']);
  if (!regions || (!allowBorder && regions.some((region) => region.border))) return null;
  return { enabled: value['enabled'], regions };
}

function parseBackgroundLayout(value: unknown): QuickEditBackgroundLayout | null {
  if (
    !isRecord(value) ||
    !isBoundedNumber(value['padding'], 0, MAX_QUICK_EDIT_BACKGROUND_SIZE) ||
    !isBoundedNumber(value['cornerRadius'], 0, MAX_QUICK_EDIT_BACKGROUND_SIZE)
  )
    return null;
  const blur = value['blur'];
  if (blur !== undefined && !isBoundedNumber(blur, 0, 25)) return null;
  const blurSetting = blur === undefined ? {} : { blur };
  const shadow = value['shadow'];
  if (shadow !== undefined) {
    if (!isRecord(shadow) || !isBoundedNumber(shadow['intensity'], 0, 100)) return null;
    const color = typeof shadow['color'] === 'string' ? normalizePaintColor(shadow['color']) : null;
    if (!color) return null;
    return {
      padding: value['padding'],
      cornerRadius: value['cornerRadius'],
      shadow: { intensity: shadow['intensity'], color },
      ...blurSetting,
    };
  }
  return { padding: value['padding'], cornerRadius: value['cornerRadius'], ...blurSetting };
}

function parseBackgroundSettings(value: unknown): QuickEditBackgroundSettings | null {
  if (!isRecord(value)) return null;
  const behavior = value['zoomBehavior'];
  if (behavior !== undefined && behavior !== 'fixed' && behavior !== 'follow-video') return null;
  const motion: Pick<QuickEditBackgroundSettings, 'zoomBehavior' | 'rememberedImage'> = behavior
    ? { zoomBehavior: behavior }
    : {};
  const remembered = value['rememberedImage'];
  if (remembered !== undefined) {
    if (
      !isRecord(remembered) ||
      !identity(remembered['assetId']) ||
      (remembered['imageFit'] !== 'cover' && remembered['imageFit'] !== 'contain') ||
      value['type'] === 'image'
    )
      return null;
    motion.rememberedImage = { assetId: remembered['assetId'], imageFit: remembered['imageFit'] };
  }
  if (value['enabled'] === false) return { enabled: false, ...motion };
  if (value['enabled'] !== true) return null;
  const layout = parseBackgroundLayout(value['layout']);
  if (!layout) return null;
  if (value['type'] === 'solid') {
    const color = typeof value['color'] === 'string' ? normalizePaintColor(value['color']) : null;
    return color ? { enabled: true, type: 'solid', color, layout, ...motion } : null;
  }
  if (value['type'] === 'gradient') {
    const paint = parsePaint({ kind: 'gradient', gradient: value['gradient'] });
    if (!paint || paint.kind !== 'gradient') return null;
    return { enabled: true, type: 'gradient', gradient: paint.gradient, layout, ...motion };
  }
  if (value['type'] === 'image') {
    return identity(value['assetId']) &&
      (value['imageFit'] === 'cover' || value['imageFit'] === 'contain')
      ? {
          enabled: true,
          type: 'image',
          assetId: value['assetId'],
          ...motion,
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
    (value['tempo'] !== undefined && !isBoundedNumber(value['tempo'], 0.25, 4)) ||
    !isBoundedNumber(value['timelineStart'], 0, MAX_QUICK_EDIT_TIME) ||
    !isBoundedNumber(value['sourceOffset'], 0, MAX_QUICK_EDIT_TIME) ||
    !isBoundedNumber(value['duration'], 0.001, MAX_QUICK_EDIT_TIME) ||
    !isBoundedNumber(value['volume'], 0, MAX_QUICK_EDIT_CLIP_VOLUME) ||
    typeof value['muted'] !== 'boolean' ||
    !isBoundedNumber(value['fadeIn'], 0, MAX_QUICK_EDIT_TRANSITION) ||
    !isBoundedNumber(value['fadeOut'], 0, MAX_QUICK_EDIT_TRANSITION)
  )
    return null;
  const sourceAnchor =
    value['sourceAnchor'] === undefined
      ? undefined
      : parseVoiceoverAnchors(value['sourceAnchor'], value['timelineStart'], value['duration']);
  const transcript =
    value['transcript'] === undefined
      ? undefined
      : parseReviewSpeechTranscript(value['transcript']);
  if (sourceAnchor === null || transcript === null) return null;
  return {
    ...(sourceAnchor ? { sourceAnchor } : {}),
    ...(transcript ? { transcript } : {}),
    ...(typeof value['tempo'] === 'number' ? { tempo: value['tempo'] } : {}),
    id: value['id'],
    assetId: value['assetId'],
    timelineStart: value['timelineStart'],
    sourceOffset: value['sourceOffset'],
    duration: value['duration'],
    volume: value['volume'],
    muted: value['muted'],
    fadeIn: value['fadeIn'],
    fadeOut: value['fadeOut'],
    ...(typeof value['dormant'] === 'boolean' ? { dormant: value['dormant'] } : {}),
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
  const ranges =
    value['ranges'] === undefined ? undefined : parseOriginalAudioRanges(value['ranges']);
  if (ranges === null) return null;
  return { muted: value['muted'], volume: value['volume'], ...(ranges ? { ranges } : {}) };
}

function parseAudioState(value: unknown): QuickEditAudioState | null {
  if (!isRecord(value)) return null;
  const original = parseOriginalAudio(value['original']);
  const voiceover = parseAudioClips(value['voiceover']);
  const music = parseAudioClips(value['music']);
  if (!original || !voiceover || !music) return null;
  const segments =
    value['voiceoverSegments'] === undefined
      ? undefined
      : parseVoiceoverSegments(value['voiceoverSegments']);
  if (
    segments === null ||
    (voiceover.some((clip) => clip.sourceAnchor) && !segments) ||
    music.some((clip) => clip.sourceAnchor || clip.tempo !== undefined)
  )
    return null;
  const timing = segments ? { voiceoverSegments: segments } : {};
  const gains = value['laneVolumes'];
  if (gains === undefined) return { original, voiceover, music, ...timing };
  if (!isRecord(gains)) return null;
  const voiceoverVolume = gains['voiceover'];
  const musicVolume = gains['music'];
  if (
    !isBoundedNumber(voiceoverVolume, 0, MAX_QUICK_EDIT_CLIP_VOLUME) ||
    !isBoundedNumber(musicVolume, 0, MAX_QUICK_EDIT_CLIP_VOLUME)
  )
    return null;
  return {
    original,
    voiceover,
    music,
    laneVolumes: { voiceover: voiceoverVolume, music: musicVolume },
    ...timing,
  };
}

/**
 * Single load point for persisted advanced content (history `advancedContent`
 * operations): the ui chrome is absent by contract and malformed content
 * rejects the operation at the workspace boundary.
 */
export function loadQuickEditAdvancedContentState(raw: unknown): QuickEditAdvancedContent | null {
  if (
    !isRecord(raw) ||
    (raw['schemaVersion'] !== QUICK_EDIT_ADVANCED_SCHEMA_VERSION &&
      raw['schemaVersion'] !== 4 &&
      raw['schemaVersion'] !== 3 &&
      raw['schemaVersion'] !== 2) ||
    (raw['webcam'] !== undefined &&
      raw['schemaVersion'] !== QUICK_EDIT_ADVANCED_SCHEMA_VERSION &&
      raw['schemaVersion'] !== 4 &&
      raw['schemaVersion'] !== 3) ||
    'ui' in raw
  )
    return null;
  const zoom = parseZoomState(
    raw['zoom'],
    raw['schemaVersion'] === QUICK_EDIT_ADVANCED_SCHEMA_VERSION ||
      raw['schemaVersion'] === 4 ||
      raw['schemaVersion'] === 3
  );
  const background = parseBackgroundSettings(raw['background']);
  const audio = parseAudioState(raw['audio']);
  const actionsEnabled = raw['actionsEnabled'];
  if (actionsEnabled !== undefined && typeof actionsEnabled !== 'boolean') return null;
  const keyAnimations = parseReviewKeyAnimations(raw['keyAnimations']);
  if (keyAnimations === null) return null;
  const clickAnimations = parseReviewClickAnimations(raw['clickAnimations']);
  if (clickAnimations === null) return null;
  const canvas = raw['canvas'] === undefined ? undefined : parseQuickEditCanvas(raw['canvas']);
  const windowHeader = parseStoredWindowHeader(raw['windowHeader']);
  const webcam = raw['webcam'] === undefined ? undefined : parseQuickEditWebcam(raw['webcam']);
  if (raw['watermark'] !== undefined && raw['schemaVersion'] !== QUICK_EDIT_ADVANCED_SCHEMA_VERSION)
    return null;
  const watermark =
    raw['watermark'] === undefined ? undefined : parseQuickEditWatermark(raw['watermark']);
  if (canvas === null || windowHeader === null || webcam === null || watermark === null)
    return null;
  if (!zoom || !background || !audio) return null;
  return {
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    zoom,
    background,
    audio,
    ...(actionsEnabled === undefined ? {} : { actionsEnabled }),
    ...(keyAnimations ? { keyAnimations } : {}),
    ...(clickAnimations ? { clickAnimations } : {}),
    ...(canvas ? { canvas } : {}),
    ...(windowHeader ? { windowHeader } : {}),
    ...(webcam ? { webcam } : {}),
    ...(watermark ? { watermark } : {}),
  };
}

/**
 * Single load point for persisted advanced quick-editor state: absent legacy data becomes
 * defaults, malformed fields reject the whole record at the workspace boundary, and the
 * known v1 format migrates through the replayed result-time segments.
 */
export function loadQuickEditAdvancedState(
  raw: unknown,
  segments?: readonly ReviewTimeSegment[]
): QuickEditAdvancedState | null {
  if (raw === undefined) return createQuickEditAdvancedState();
  if (!isRecord(raw)) return null;
  const version = raw['schemaVersion'];
  if (
    version === QUICK_EDIT_ADVANCED_SCHEMA_VERSION ||
    version === 4 ||
    version === 3 ||
    version === 2
  )
    return parseAdvancedFields(raw);
  if (version === QUICK_EDIT_ADVANCED_SCHEMA_V1 && segments) {
    const parsed = parseAdvancedFields(raw);
    if (!parsed) return null;
    const { schemaVersion: _schemaVersion, ...fields } = parsed;
    return migrateQuickEditAdvancedV1(fields, segments);
  }
  return null;
}

/** Parses the current shape; the recovery copy is an opaque string. */
function parseAdvancedFields(raw: Record<string, unknown>): QuickEditAdvancedState | null {
  if (
    raw['webcam'] !== undefined &&
    raw['schemaVersion'] !== QUICK_EDIT_ADVANCED_SCHEMA_VERSION &&
    raw['schemaVersion'] !== 4 &&
    raw['schemaVersion'] !== 3
  )
    return null;
  const ui = parseUiState(raw['ui']);
  const zoom = parseZoomState(
    raw['zoom'],
    raw['schemaVersion'] === QUICK_EDIT_ADVANCED_SCHEMA_VERSION ||
      raw['schemaVersion'] === 4 ||
      raw['schemaVersion'] === 3
  );
  const background = parseBackgroundSettings(raw['background']);
  const audio = parseAudioState(raw['audio']);
  const actionsEnabled = raw['actionsEnabled'];
  if (actionsEnabled !== undefined && typeof actionsEnabled !== 'boolean') return null;
  const keyAnimations = parseReviewKeyAnimations(raw['keyAnimations']);
  if (keyAnimations === null) return null;
  const clickAnimations = parseReviewClickAnimations(raw['clickAnimations']);
  if (clickAnimations === null) return null;
  const canvas = raw['canvas'] === undefined ? undefined : parseQuickEditCanvas(raw['canvas']);
  const windowHeader = parseStoredWindowHeader(raw['windowHeader']);
  const webcam = raw['webcam'] === undefined ? undefined : parseQuickEditWebcam(raw['webcam']);
  if (raw['watermark'] !== undefined && raw['schemaVersion'] !== QUICK_EDIT_ADVANCED_SCHEMA_VERSION)
    return null;
  const watermark =
    raw['watermark'] === undefined ? undefined : parseQuickEditWatermark(raw['watermark']);
  if (canvas === null || windowHeader === null || webcam === null || watermark === null)
    return null;
  const recovery = raw['recoveryV1'];
  if (recovery !== undefined && typeof recovery !== 'string') return null;
  if (!ui || !zoom || !background || !audio) return null;
  return {
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    ...(recovery === undefined ? {} : { recoveryV1: recovery }),
    ui,
    zoom,
    background,
    ...(actionsEnabled === undefined ? {} : { actionsEnabled }),
    ...(keyAnimations ? { keyAnimations } : {}),
    ...(clickAnimations ? { clickAnimations } : {}),
    ...(canvas ? { canvas } : {}),
    ...(windowHeader ? { windowHeader } : {}),
    ...(webcam ? { webcam } : {}),
    ...(watermark ? { watermark } : {}),
    audio,
  };
}
