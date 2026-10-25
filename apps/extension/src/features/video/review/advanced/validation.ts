import { parseReviewAudioClip } from '../audio-clip-validation';
import {
  parseQuickEditBorder,
  parseQuickEditSpotlight,
} from '../../project/scene/focus-appearance';
import { parseMotionBlurPhases } from '../../project/motion/blur';
import { parseCameraFollowSettings } from '../../project/camera/cursor-policy';
import { parseCursorFocusPath } from '../../project/cursor-focus-path/validation';
import { parseReviewActionAudio } from './action-audio';
import { parseQuickEditShadow } from './shadow-validation';
import { parseReviewAnnotationEffects } from '../annotation-effects/validation';
import { parseReviewOriginalSpeech } from '../original-speech';
import { parseReviewCaptionSettings, parseReviewTextDocument } from '../text-validation';
import { parseQuickEditPresentationSettings } from './presentation';
import { parseQuickEditWatermark } from '../../project/scene/watermark';
import { parseReviewKeyAnimations } from '../../project/action-feedback/key-animation';
import {
  parseCameraPerspective as parseQuickEditPerspective,
  parseCameraDepth as parseQuickEditDepth,
} from '../../project/motion/spatial';
import { parseReviewClickAnimations } from './click-animation';

import { quickEditFocusConflicts } from './focus-layout';
import { parseSourceAudioGainRanges } from '../../audio/source-envelope';
import { parseOriginalAudioMutes, validOriginalAudioMuteBindings } from './original-audio-mutes';
import { parseVoiceoverSegments } from '../voiceover-validation';

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
import { parseWindowHeader } from '@sniptale/runtime-contracts/window-header';
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
    ['text', 'originalAudio', 'voiceover', 'music'].some(
      (key) => value[key] !== undefined && typeof value[key] !== 'boolean'
    ) ||
    (value['webcam'] !== undefined && typeof value['webcam'] !== 'boolean') ||
    (value['annotationEffects'] !== undefined && typeof value['annotationEffects'] !== 'boolean')
  )
    return null;
  return {
    ...(typeof value['text'] === 'boolean' ? { text: value['text'] } : {}),
    ...(typeof value['originalAudio'] === 'boolean'
      ? { originalAudio: value['originalAudio'] }
      : {}),
    ...(typeof value['voiceover'] === 'boolean' ? { voiceover: value['voiceover'] } : {}),
    ...(typeof value['music'] === 'boolean' ? { music: value['music'] } : {}),
    actions: value['actions'],
    zoom: value['zoom'],
    audio: value['audio'],
    ...(value['webcam'] === undefined ? {} : { webcam: value['webcam'] }),
    ...(value['annotationEffects'] === undefined
      ? {}
      : { annotationEffects: value['annotationEffects'] }),
  };
}

/** Admit only normalized solid colors for the two resolved application themes. */
function parseWorkspaceColors(value: unknown): QuickEditUiState['workspaceColors'] | null {
  if (value === undefined) return {};
  if (!isRecord(value) || Array.isArray(value)) return null;
  const colors: NonNullable<QuickEditUiState['workspaceColors']> = {};
  for (const theme of ['light', 'dark'] as const) {
    const raw = value[theme];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') return null;
    const color = normalizePaintColor(raw);
    if (!color) return null;
    colors[theme] = color;
  }
  return colors;
}

function parseLockedTracks(value: unknown): QuickEditUiState['lockedTracks'] | null {
  if (value === undefined) return {};
  if (!isRecord(value) || Array.isArray(value)) return null;
  const locks: NonNullable<QuickEditUiState['lockedTracks']> = {};
  for (const track of [
    'source',
    'actions',
    'zoom',
    'text',
    'annotationEffects',
    'webcam',
    'originalAudio',
    'voiceover',
    'music',
  ] as const) {
    const locked = value[track];
    if (locked === undefined) continue;
    if (typeof locked !== 'boolean') return null;
    locks[track] = locked;
  }
  return locks;
}

function parseUiState(value: unknown): QuickEditUiState | null {
  if (!isRecord(value) || (value['mode'] !== 'basic' && value['mode'] !== 'advanced')) return null;
  const lockedTracks = parseLockedTracks(value['lockedTracks']);
  if (!lockedTracks) return null;
  const initialized = value['advancedTracksInitialized'];
  if (initialized !== undefined && typeof initialized !== 'boolean') return null;
  const modeSelectionPending = value['modeSelectionPending'];
  if (modeSelectionPending !== undefined && typeof modeSelectionPending !== 'boolean') return null;
  const workspaceColors = parseWorkspaceColors(value['workspaceColors']);
  if (!workspaceColors) return null;
  const tracks = parseTrackVisibility(value['tracks']);
  if (!tracks) return null;
  // Pre-overlay workspaces omit the display toggle; missing or invalid falls back on.
  return {
    ...(value['workspaceColors'] === undefined ? {} : { workspaceColors }),
    ...(value['lockedTracks'] === undefined ? {} : { lockedTracks }),
    mode: value['mode'],
    ...(modeSelectionPending === undefined ? {} : { modeSelectionPending }),
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

function parseZoomRegion(value: unknown): QuickEditZoomRegion | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !isBoundedNumber(value['start'], 0, MAX_QUICK_EDIT_TIME) ||
    !isBoundedNumber(value['end'], 0, MAX_QUICK_EDIT_TIME) ||
    value['start'] >= value['end']
  )
    return null;
  if (value['followCursor'] !== undefined && typeof value['followCursor'] !== 'boolean')
    return null;
  const cameraFollow =
    value['cameraFollow'] === undefined
      ? undefined
      : parseCameraFollowSettings(value['cameraFollow']);
  if (cameraFollow === null) return null;
  const perspective = parseQuickEditPerspective(value['perspective']);
  const depthOfField = parseQuickEditDepth(value['depthOfField']);
  if (perspective === null || depthOfField === null) return null;
  const motionBlur = parseMotionBlurPhases(value['motionBlur']);
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
    ...(cameraFollow ? { cameraFollow } : {}),
    ...(typeof value['followCursor'] === 'boolean' ? { followCursor: value['followCursor'] } : {}),
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
    const parsedShadow = parseQuickEditShadow(shadow);
    if (!parsedShadow) return null;
    return {
      padding: value['padding'],
      cornerRadius: value['cornerRadius'],
      shadow: parsedShadow,
      ...blurSetting,
    };
  }
  return { padding: value['padding'], cornerRadius: value['cornerRadius'], ...blurSetting };
}

function parseBackgroundSettings(value: unknown): QuickEditBackgroundSettings | null {
  if (!isRecord(value)) return null;
  const behavior = value['zoomBehavior'];
  if (
    behavior !== undefined &&
    behavior !== 'fixed' &&
    behavior !== 'follow-video' &&
    behavior !== 'window' &&
    behavior !== 'content'
  )
    return null;
  const motion: Pick<
    QuickEditBackgroundSettings,
    'zoomBehavior' | 'rememberedImage' | 'rememberedPaint' | 'rememberedLayout'
  > = behavior ? { zoomBehavior: behavior } : {};
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
  if (value['rememberedPaint'] !== undefined) {
    const paint = parsePaint(value['rememberedPaint']);
    if (!paint) return null;
    motion.rememberedPaint = paint;
  }
  if (value['rememberedLayout'] !== undefined) {
    const layout = parseBackgroundLayout(value['rememberedLayout']);
    if (!layout) return null;
    motion.rememberedLayout = layout;
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

function parseAudioClips(value: unknown): QuickEditAudioClip[] | null {
  const clips = parseBoundedArray(value, MAX_QUICK_EDIT_AUDIO_CLIPS, parseReviewAudioClip);
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
    value['ranges'] === undefined ? undefined : parseSourceAudioGainRanges(value['ranges']);
  const mutes = value['mutes'] === undefined ? undefined : parseOriginalAudioMutes(value['mutes']);
  if (ranges === null || mutes === null) return null;
  return {
    muted: value['muted'],
    volume: value['volume'],
    ...(ranges ? { ranges } : {}),
    ...(mutes ? { mutes } : {}),
  };
}

function parseAudioState(value: unknown, allowOriginalSpeech: boolean): QuickEditAudioState | null {
  if (!isRecord(value)) return null;
  if (value['originalSpeech'] !== undefined && !allowOriginalSpeech) return null;
  const originalSpeech =
    value['originalSpeech'] === undefined
      ? undefined
      : parseReviewOriginalSpeech(value['originalSpeech']);
  if (originalSpeech === null) return null;
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
  const timing = {
    ...(segments ? { voiceoverSegments: segments } : {}),
    ...(originalSpeech ? { originalSpeech } : {}),
  };
  const gains = value['laneVolumes'];
  if (!validOriginalAudioMuteBindings({ original, voiceover, music, ...timing })) return null;
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
  if (!isRecord(raw) || !supportsAdvancedSchema(raw['schemaVersion'], 2) || 'ui' in raw)
    return null;
  return parseAdvancedContentFields(raw);
}

function parseAdvancedContentFields(raw: Record<string, unknown>): QuickEditAdvancedContent | null {
  const cameraFollowDefaults =
    raw['cameraFollowDefaults'] === undefined
      ? undefined
      : parseCameraFollowSettings(raw['cameraFollowDefaults']);
  if (
    cameraFollowDefaults === null ||
    (cameraFollowDefaults && !supportsAdvancedSchema(raw['schemaVersion'], 20))
  )
    return null;
  const cursorFocusPath =
    raw['cursorFocusPath'] === undefined ? undefined : parseCursorFocusPath(raw['cursorFocusPath']);
  if (
    cursorFocusPath === null ||
    (cursorFocusPath && !supportsAdvancedSchema(raw['schemaVersion'], 18))
  )
    return null;
  const actionAudio = parseReviewActionAudio(raw['actionAudio']);
  if (actionAudio === null || (actionAudio && !supportsAdvancedSchema(raw['schemaVersion'], 17)))
    return null;
  const text =
    isRecord(raw) && raw['text'] !== undefined ? parseReviewTextDocument(raw['text']) : undefined;
  const captions =
    isRecord(raw) && raw['captions'] !== undefined
      ? parseReviewCaptionSettings(raw['captions'])
      : undefined;
  const annotationEffects =
    isRecord(raw) && raw['annotationEffects'] !== undefined
      ? parseReviewAnnotationEffects(raw['annotationEffects'])
      : undefined;
  if (
    text === null ||
    captions === null ||
    annotationEffects === null ||
    (annotationEffects && !supportsAdvancedSchema(raw['schemaVersion'], 15))
  )
    return null;
  if (raw['webcam'] !== undefined && !supportsAdvancedSchema(raw['schemaVersion'], 3)) return null;
  const zoom = parseZoomState(raw['zoom'], supportsAdvancedSchema(raw['schemaVersion'], 3));
  if (
    zoom?.regions.some((region) => region.cameraFollow !== undefined) &&
    !supportsAdvancedSchema(raw['schemaVersion'], 20)
  )
    return null;
  if (
    zoom &&
    !supportsAdvancedSchema(raw['schemaVersion'], 19) &&
    zoom.regions.some((region) => region.followCursor !== undefined)
  )
    return null;
  const background = parseBackgroundSettings(raw['background']);
  const audio = parseAudioState(raw['audio'], supportsAdvancedSchema(raw['schemaVersion'], 7));
  const actionsEnabled = raw['actionsEnabled'];
  if (actionsEnabled !== undefined && typeof actionsEnabled !== 'boolean') return null;
  const keyAnimations = parseReviewKeyAnimations(raw['keyAnimations']);
  if (keyAnimations === null) return null;
  const clickAnimations = parseReviewClickAnimations(raw['clickAnimations']);
  if (clickAnimations === null) return null;
  if (
    !supportsAdvancedSchema(raw['schemaVersion'], 18) &&
    (clickAnimations?.some(
      (style) => style.gestureAppearance !== undefined || style.gestureArea !== undefined
    ) ||
      actionAudio?.some(
        (style) =>
          style.presetId?.endsWith('-v2') ||
          style.downEnabled !== undefined ||
          style.upEnabled !== undefined ||
          style.downGain !== undefined ||
          style.upGain !== undefined ||
          style.includeRepeats !== undefined
      ))
  )
    return null;
  const canvas = raw['canvas'] === undefined ? undefined : parseQuickEditCanvas(raw['canvas']);
  if (canvas?.crop && !supportsAdvancedSchema(raw['schemaVersion'], 21)) return null;
  const windowHeader = parseStoredWindowHeader(raw['windowHeader']);
  const webcam = raw['webcam'] === undefined ? undefined : parseQuickEditWebcam(raw['webcam']);
  if (
    webcam &&
    !supportsAdvancedSchema(raw['schemaVersion'], 24) &&
    (webcam.screenBehavior !== undefined ||
      webcam.positions.some((position) => position.screenBehavior !== undefined))
  )
    return null;
  if (webcam?.shadowDirection !== undefined && !supportsAdvancedSchema(raw['schemaVersion'], 25))
    return null;
  if (raw['watermark'] !== undefined && !supportsAdvancedSchema(raw['schemaVersion'], 5))
    return null;
  const watermark =
    raw['watermark'] === undefined ? undefined : parseQuickEditWatermark(raw['watermark']);
  if (raw['presentation'] !== undefined && !supportsAdvancedSchema(raw['schemaVersion'], 6))
    return null;
  const presentation =
    raw['presentation'] === undefined ? undefined : parseStoredPresentation(raw['presentation']);
  if (presentation === null) return null;
  if (canvas === null || windowHeader === null || webcam === null || watermark === null)
    return null;
  if (!zoom || !background || !audio) return null;
  return {
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    ...(cameraFollowDefaults ? { cameraFollowDefaults } : {}),
    ...(cursorFocusPath ? { cursorFocusPath } : {}),
    zoom,
    background,
    audio,
    ...(text ? { text } : {}),
    ...(captions ? { captions } : {}),
    ...(annotationEffects ? { annotationEffects } : {}),
    ...(actionsEnabled === undefined ? {} : { actionsEnabled }),
    ...(keyAnimations ? { keyAnimations } : {}),
    ...(clickAnimations ? { clickAnimations } : {}),
    ...(actionAudio ? { actionAudio } : {}),
    ...(canvas ? { canvas } : {}),
    ...(windowHeader ? { windowHeader } : {}),
    ...(webcam ? { webcam } : {}),
    ...(watermark ? { watermark } : {}),
    ...(presentation ? { presentation } : {}),
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
  if (supportsAdvancedSchema(version, 2)) return parseAdvancedFields(raw);
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
  const content = parseAdvancedContentFields(raw);
  const ui = parseUiState(raw['ui']);
  const recovery = raw['recoveryV1'];
  if (!content || !ui || (recovery !== undefined && typeof recovery !== 'string')) return null;
  const { schemaVersion, zoom, background, audio, ...decorations } = content;
  return {
    schemaVersion,
    ...(recovery === undefined ? {} : { recoveryV1: recovery }),
    ui,
    zoom,
    background,
    ...decorations,
    audio,
  };
}

/** Durable scene resources use the project-asset owner; pure model IDs are transport-neutral. */
function parseStoredPresentation(raw: unknown) {
  const settings = parseQuickEditPresentationSettings(raw);
  if (!settings) return null;
  for (const slot of [settings.intro, settings.outro]) {
    for (const resource of [slot.image, slot.video]) {
      if (resource && !/^project-asset:\S{1,242}$/u.test(resource.assetId)) return null;
    }
  }
  return settings;
}

/** Historical admission is explicit: never accept an unknown/fractional schema. */
function supportsAdvancedSchema(version: unknown, firstHistorical: number): boolean {
  return (
    version === QUICK_EDIT_ADVANCED_SCHEMA_VERSION ||
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].some(
      (known) => known >= firstHistorical && version === known
    )
  );
}
