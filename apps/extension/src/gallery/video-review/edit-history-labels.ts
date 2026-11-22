import { formatPreciseTime } from '../../composition/library-preview/time-format';
import type {
  QuickEditAdvancedContent,
  QuickEditZoomRegion,
  QuickEditZoomTransition,
} from '../../features/video/review/advanced/types';
import { equalAdvancedContentValue } from '../../features/video/review/document';
import type { ReviewOperation } from '../../features/video/review/types';
import {
  resolveCameraFollowPolicy,
  type CameraFollowSettings,
} from '../../features/video/project/camera/cursor-policy';
import { DEFAULT_RECORDED_CURSOR_FOCUS_SETTINGS } from '../../features/video/project/cursor-focus-path/recorded';
import type { CursorFocusKey } from '../../features/video/project/cursor-focus-path/types';
import type { CursorMotion } from '../../features/video/project/cursor-motion';
import { formatNumber, translate, type AppLocale, type TranslationKey } from '../../platform/i18n';

const advancedLabels = {
  schemaVersion: null,
  audio: null,
  sourceFilters: 'videoEditor.sidebar.sourceFiltersTitle',
  cursorMotionEnabled: null,
  cursorMotions: null,
  cameraFollowDefaults: null,
  cursorFocusPath: null,
  text: 'gallery.videoReview.textTrack',
  captions: 'gallery.videoReview.captionStyle',
  annotationEffects: 'gallery.videoReview.annotationEffects',
  actionsEnabled: 'gallery.videoReview.historyEffectsEnabled',
  interactionTimeline: 'gallery.videoReview.telemetry',
  keyAnimations: 'gallery.videoReview.keyCaption',
  clickAnimations: 'gallery.videoReview.clickAnimation',
  actionAudio: 'gallery.videoReview.actionAudio',
  zoom: null,
  background: null,
  canvas: 'gallery.videoReview.canvas',
  windowHeader: 'gallery.videoReview.windowHeader',
  webcam: 'gallery.videoReview.webcam',
  watermark: 'gallery.videoReview.watermark',
  presentation: 'gallery.videoReview.presentation',
} as const satisfies Record<keyof QuickEditAdvancedContent, TranslationKey | null>;

const audioLabels = {
  original: 'gallery.videoReview.audioOriginal',
  voiceover: 'gallery.videoReview.audioVoiceover',
  music: 'gallery.videoReview.audioMusic',
} as const;

const editLabels = {
  cut: 'gallery.videoReview.editHistoryCut',
  speed: 'gallery.videoReview.speedMode',
  freeze: 'gallery.videoReview.freezeFrame',
} as const;

const cursorShapeLabels = {
  arrow: 'gallery.videoReview.cursorShapeArrow',
  pointer: 'gallery.videoReview.cursorShapePointer',
  grab: 'gallery.videoReview.cursorShapeGrab',
  text: 'gallery.videoReview.cursorShapeText',
  crosshair: 'gallery.videoReview.cursorShapeCrosshair',
} as const;

const actionLabels = {
  Added: 'gallery.videoReview.editHistoryAdded',
  Removed: 'gallery.videoReview.editHistoryRemoved',
  Updated: 'gallery.videoReview.editHistoryUpdated',
  Enabled: 'gallery.videoReview.editHistoryEnabled',
  Disabled: 'gallery.videoReview.editHistoryDisabled',
} as const;

function actionCaption(action: keyof typeof actionLabels, subject: string, locale: AppLocale) {
  return translate(actionLabels[action], locale).replace('{item}', subject);
}

function fieldChange(label: string, before: string, after: string) {
  return before === after ? undefined : `${label} ${before} → ${after}`;
}

function historyTimeRange(item: { start: number; end: number }) {
  return `${formatPreciseTime(item.start)}–${formatPreciseTime(item.end)}`;
}

function retainedItemChanges<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
  locale: AppLocale,
  subject: (item: T, action: 'Added' | 'Removed' | 'Updated') => string,
  describeUpdate: (before: T, after: T) => (string | undefined)[]
) {
  if (equalAdvancedContentValue(before, after)) return [];
  const previous = new Map(before.map((item) => [item.id, item]));
  const changes: string[] = [];
  for (const item of after) {
    const old = previous.get(item.id);
    previous.delete(item.id);
    if (!old) changes.push(actionCaption('Added', subject(item, 'Added'), locale));
    else if (!equalAdvancedContentValue(old, item)) {
      const fields = describeUpdate(old, item).filter(Boolean);
      changes.push(
        fields.length
          ? `${subject(item, 'Updated')} · ${fields.join(' · ')}`
          : actionCaption('Updated', subject(item, 'Updated'), locale)
      );
    }
  }
  for (const removed of previous.values())
    changes.push(actionCaption('Removed', subject(removed, 'Removed'), locale));
  return changes;
}

function timelineChanges<T extends { id: string; start: number; end: number }>(
  before: readonly T[],
  after: readonly T[],
  label: TranslationKey,
  describeUpdate: (before: T, after: T, locale: AppLocale) => (string | undefined)[],
  locale: AppLocale
) {
  return retainedItemChanges(
    before,
    after,
    locale,
    (item) => `${translate(label, locale)} (${formatPreciseTime(item.start)})`,
    (old, item) => [
      fieldChange(
        translate('gallery.videoReview.editHistoryTiming', locale),
        historyTimeRange(old),
        historyTimeRange(item)
      ),
      ...describeUpdate(old, item, locale),
    ]
  );
}

function pointPosition(point: { x: number; y: number }, locale: AppLocale) {
  return [point.x, point.y]
    .map((value) => formatNumber(value, { style: 'percent', maximumFractionDigits: 2 }, locale))
    .join(' / ');
}

const transitionLabels = {
  none: 'gallery.videoReview.transitionNone',
  linear: 'gallery.videoReview.transitionLinear',
  'ease-in-out': 'gallery.videoReview.transitionSmooth',
} as const;

function transitionCaption(transition: QuickEditZoomTransition, locale: AppLocale) {
  const name = translate(transitionLabels[transition.type], locale);
  return transition.type === 'none' ? name : `${name} (${formatPreciseTime(transition.duration)})`;
}

function focusModeCaption(follow: boolean | undefined, locale: AppLocale) {
  if (follow === undefined) return translate('videoEditor.sidebar.cameraInherited', locale);
  return translate(
    follow ? 'videoEditor.sidebar.cursorFocusFollow' : 'videoEditor.sidebar.cursorFocusFixed',
    locale
  );
}

function cameraPolicyChanges(
  before: CameraFollowSettings | undefined,
  after: CameraFollowSettings | undefined,
  locale: AppLocale,
  defaults?: { before: CameraFollowSettings | undefined; after: CameraFollowSettings | undefined }
) {
  if (equalAdvancedContentValue(before, after)) return [];
  const previous = resolveCameraFollowPolicy({
    ...(defaults?.before ? { defaults: defaults.before } : {}),
    ...(before ? { override: before } : {}),
  }).settings;
  const next = resolveCameraFollowPolicy({
    ...(defaults?.after ? { defaults: defaults.after } : {}),
    ...(after ? { override: after } : {}),
  }).settings;
  const text = (key: TranslationKey) => translate(key, locale);
  const percent = (value: number) =>
    formatNumber(value, { style: 'percent', maximumFractionDigits: 2 }, locale);
  const zoom = (value: number) => `${formatNumber(value, { maximumFractionDigits: 3 }, locale)}×`;
  const changes = [
    fieldChange(
      text('videoEditor.sidebar.cameraZoneSize'),
      percent(previous.zoneSize),
      percent(next.zoneSize)
    ),
    fieldChange(
      text('videoEditor.sidebar.cameraTransitionDuration'),
      formatPreciseTime(previous.transitionDuration),
      formatPreciseTime(next.transitionDuration)
    ),
    fieldChange(
      text('videoEditor.sidebar.cameraMargin'),
      percent(previous.marginFraction),
      percent(next.marginFraction)
    ),
    fieldChange(
      text('videoEditor.sidebar.cameraMinimumHold'),
      formatPreciseTime(previous.minimumHoldDuration),
      formatPreciseTime(next.minimumHoldDuration)
    ),
    fieldChange(
      text('videoEditor.sidebar.cameraMinimumScale'),
      zoom(previous.minimumScale),
      zoom(next.minimumScale)
    ),
    ...(
      [
        ['preservePointer', 'videoEditor.sidebar.cameraPreservePointer'],
        ['allowExpansion', 'videoEditor.sidebar.cameraAllowExpansion'],
      ] as const
    ).map(([field, label]) =>
      previous[field] === next[field]
        ? undefined
        : actionCaption(next[field] ? 'Enabled' : 'Disabled', text(label), locale)
    ),
  ].filter(Boolean);
  return changes.length
    ? changes
    : [actionCaption('Updated', text('gallery.videoReview.editHistoryCameraFollow'), locale)];
}

function focusRegionChanges(
  before: QuickEditZoomRegion,
  after: QuickEditZoomRegion,
  locale: AppLocale,
  defaults: { before: CameraFollowSettings | undefined; after: CameraFollowSettings | undefined }
) {
  const zoom = (value: number) => `${formatNumber(value, { maximumFractionDigits: 3 }, locale)}×`;
  const center = ({ centerX, centerY }: QuickEditZoomRegion['transform']) =>
    pointPosition({ x: centerX, y: centerY }, locale);
  return [
    fieldChange(
      translate('gallery.videoReview.zoomScale', locale),
      zoom(before.transform.scale),
      zoom(after.transform.scale)
    ),
    fieldChange(
      translate('gallery.videoReview.editHistoryCenter', locale),
      center(before.transform),
      center(after.transform)
    ),
    fieldChange(
      translate('gallery.videoReview.editHistoryCameraFollow', locale),
      focusModeCaption(before.followCursor, locale),
      focusModeCaption(after.followCursor, locale)
    ),
    fieldChange(
      translate('gallery.videoReview.zoomTransitionIn', locale),
      transitionCaption(before.enter, locale),
      transitionCaption(after.enter, locale)
    ),
    fieldChange(
      translate('gallery.videoReview.zoomTransitionOut', locale),
      transitionCaption(before.exit, locale),
      transitionCaption(after.exit, locale)
    ),
    ...cameraPolicyChanges(before.cameraFollow, after.cameraFollow, locale, defaults),
    ...(
      [
        ['linkTo', 'gallery.videoReview.zoomLinkSettings'],
        ['linkEasing', 'gallery.videoReview.zoomLinkSettings'],
        ['perspective', 'gallery.videoReview.perspective'],
        ['depthOfField', 'gallery.videoReview.depthOfField'],
        ['motionBlur', 'gallery.videoReview.motionBlur'],
      ] as const
    ).map(([field, label]) =>
      equalAdvancedContentValue(before[field], after[field])
        ? undefined
        : actionCaption('Updated', translate(label, locale), locale)
    ),
  ];
}

function cursorPointChanges(before: CursorMotion, after: CursorMotion, locale: AppLocale) {
  return retainedItemChanges(
    before.points,
    after.points,
    locale,
    (point) =>
      `${translate('gallery.videoReview.editHistoryCursorPoint', locale)} (${formatPreciseTime(point.at)})`,
    (old, point) => [
      fieldChange(
        translate('gallery.videoReview.editHistoryPointTime', locale),
        formatPreciseTime(old.at),
        formatPreciseTime(point.at)
      ),
      fieldChange(
        translate('gallery.videoReview.spatialToolPosition', locale),
        pointPosition(old, locale),
        pointPosition(point, locale)
      ),
    ]
  );
}

function cursorClipChanges(before: CursorMotion, after: CursorMotion, locale: AppLocale) {
  const text = (key: TranslationKey) => translate(key, locale);
  const easing = (value: CursorMotion['easing']) =>
    text(
      value === 'linear'
        ? 'gallery.videoReview.cursorMotionLinear'
        : 'gallery.videoReview.cursorMotionSmooth'
    );
  return [
    before.enabled === after.enabled
      ? undefined
      : actionCaption(
          after.enabled ? 'Enabled' : 'Disabled',
          text('gallery.videoReview.editHistoryCursorVisibility'),
          locale
        ),
    fieldChange(text('gallery.videoReview.cursorMotionSize'), `${before.size}`, `${after.size}`),
    fieldChange(
      text('gallery.videoReview.cursorMotionShape'),
      text(cursorShapeLabels[before.shape]),
      text(cursorShapeLabels[after.shape])
    ),
    fieldChange(text('gallery.videoReview.cursorMotionColor'), before.color, after.color),
    fieldChange(text('gallery.videoReview.cursorMotionOutline'), before.outline, after.outline),
    fieldChange(
      text('gallery.videoReview.cursorMotionEasing'),
      easing(before.easing),
      easing(after.easing)
    ),
    before.shadow === after.shadow
      ? undefined
      : actionCaption(
          after.shadow ? 'Enabled' : 'Disabled',
          text('gallery.videoReview.cursorMotionShadow'),
          locale
        ),
    ...cursorPointChanges(before, after, locale),
  ];
}

const focusCurveLabels = {
  linear: 'videoEditor.sidebar.cursorFocusLinear',
  smooth: 'videoEditor.sidebar.cursorFocusSmooth',
  hold: 'videoEditor.sidebar.cursorFocusHold',
} as const;

function focusKeyFields(before: CursorFocusKey, after: CursorFocusKey, locale: AppLocale) {
  const position = (point: { x: number; y: number } | undefined) =>
    point ? pointPosition(point, locale) : translate('gallery.videoReview.transitionNone', locale);
  return [
    fieldChange(
      translate('gallery.videoReview.editHistoryPointTime', locale),
      formatPreciseTime(before.time),
      formatPreciseTime(after.time)
    ),
    fieldChange(
      translate('gallery.videoReview.spatialToolPosition', locale),
      position(before),
      position(after)
    ),
    fieldChange(
      translate('videoEditor.sidebar.cursorFocusCurve', locale),
      translate(focusCurveLabels[before.interpolation], locale),
      translate(focusCurveLabels[after.interpolation], locale)
    ),
    fieldChange(
      translate('videoEditor.sidebar.cursorFocusIncoming', locale),
      position(before.incoming),
      position(after.incoming)
    ),
    fieldChange(
      translate('videoEditor.sidebar.cursorFocusOutgoing', locale),
      position(before.outgoing),
      position(after.outgoing)
    ),
  ];
}

function focusPathChanges(
  before: QuickEditAdvancedContent['cursorFocusPath'],
  after: QuickEditAdvancedContent['cursorFocusPath'],
  locale: AppLocale
) {
  if (equalAdvancedContentValue(before, after)) return [];
  const path = translate('videoEditor.sidebar.cursorFocusPathTitle', locale);
  const keyChanges = retainedItemChanges(
    before?.segments.flatMap((segment) => segment.keys) ?? [],
    after?.segments.flatMap((segment) => segment.keys) ?? [],
    locale,
    (key, action) => {
      const name = translate('videoEditor.sidebar.cursorFocusKey', locale);
      const time = formatPreciseTime(key.time);
      if (action === 'Updated') return `${name} (${time})`;
      const curve = translate(focusCurveLabels[key.interpolation], locale);
      const details = [time, pointPosition(key, locale), curve];
      for (const [point, label] of [
        [key.incoming, 'videoEditor.sidebar.cursorFocusIncoming'],
        [key.outgoing, 'videoEditor.sidebar.cursorFocusOutgoing'],
      ] as const) {
        if (point) details.push(`${translate(label, locale)} ${pointPosition(point, locale)}`);
      }
      return `${name} (${details.join(', ')})`;
    },
    (old, key) => focusKeyFields(old, key, locale)
  );
  const percent = (value: number) =>
    formatNumber(value, { style: 'percent', maximumFractionDigits: 2 }, locale);
  const previous = before ?? DEFAULT_RECORDED_CURSOR_FOCUS_SETTINGS;
  const next = after ?? DEFAULT_RECORDED_CURSOR_FOCUS_SETTINGS;
  const changes = [
    fieldChange(
      translate('videoEditor.sidebar.cursorFocusMode', locale),
      focusModeCaption(previous.mode === 'follow', locale),
      focusModeCaption(next.mode === 'follow', locale)
    ),
    fieldChange(
      translate('videoEditor.sidebar.cursorFocusSmoothing', locale),
      percent(previous.smoothing),
      percent(next.smoothing)
    ),
    fieldChange(
      translate('videoEditor.sidebar.cursorFocusSensitivity', locale),
      percent(previous.sensitivity),
      percent(next.sensitivity)
    ),
    ...keyChanges,
  ].filter(Boolean);
  return changes.length
    ? changes
    : [actionCaption(!before ? 'Added' : !after ? 'Removed' : 'Updated', path, locale)];
}

function backgroundChanges(
  before: QuickEditAdvancedContent['background'],
  after: QuickEditAdvancedContent['background'],
  locale: AppLocale
) {
  if (equalAdvancedContentValue(before, after)) return [];
  const text = (key: TranslationKey) => translate(key, locale);
  const subject = text('gallery.videoReview.background');
  if (before.enabled !== after.enabled)
    return [actionCaption(after.enabled ? 'Enabled' : 'Disabled', subject, locale)];
  if (!before.enabled || !after.enabled) return [actionCaption('Updated', subject, locale)];
  const typeLabels = {
    solid: 'gallery.videoReview.backgroundSolid',
    gradient: 'gallery.videoReview.backgroundGradient',
    image: 'gallery.videoReview.backgroundImage',
  } as const;
  const changes = [
    fieldChange(
      text('gallery.videoReview.backgroundType'),
      text(typeLabels[before.type]),
      text(typeLabels[after.type])
    ),
    before.type === 'solid' && after.type === 'solid'
      ? fieldChange(text('gallery.videoReview.backgroundSolid'), before.color, after.color)
      : undefined,
    fieldChange(
      text('gallery.videoReview.backgroundPadding'),
      `${before.layout.padding}`,
      `${after.layout.padding}`
    ),
    fieldChange(
      text('editor.scene.backgroundBlurAmount'),
      `${before.layout.blur ?? 0}`,
      `${after.layout.blur ?? 0}`
    ),
    fieldChange(
      text('gallery.videoReview.backgroundCornerRadius'),
      `${before.layout.cornerRadius}`,
      `${after.layout.cornerRadius}`
    ),
  ].filter(Boolean);
  return changes.length
    ? [`${subject} · ${changes.join(' · ')}`]
    : [actionCaption('Updated', subject, locale)];
}

function advancedHistoryTitle(
  before: QuickEditAdvancedContent,
  after: QuickEditAdvancedContent,
  locale: AppLocale
) {
  const labels = new Set<string>();
  if (before.zoom.enabled !== after.zoom.enabled)
    labels.add(
      actionCaption(
        after.zoom.enabled ? 'Enabled' : 'Disabled',
        translate('gallery.videoReview.zoomTrack', locale),
        locale
      )
    );
  if ((before.cursorMotionEnabled !== false) !== (after.cursorMotionEnabled !== false))
    labels.add(
      actionCaption(
        after.cursorMotionEnabled !== false ? 'Enabled' : 'Disabled',
        translate('gallery.videoReview.editHistoryCursorVisibility', locale),
        locale
      )
    );
  for (const label of [
    ...timelineChanges(
      before.zoom.regions,
      after.zoom.regions,
      'gallery.videoReview.editHistoryFocusRegion',
      (old, item, itemLocale) =>
        focusRegionChanges(old, item, itemLocale, {
          before: before.cameraFollowDefaults,
          after: after.cameraFollowDefaults,
        }),
      locale
    ),
    ...timelineChanges(
      before.cursorMotions ?? [],
      after.cursorMotions ?? [],
      'gallery.videoReview.editHistoryCursorClip',
      cursorClipChanges,
      locale
    ),
    ...focusPathChanges(before.cursorFocusPath, after.cursorFocusPath, locale),
    ...cameraPolicyChanges(before.cameraFollowDefaults, after.cameraFollowDefaults, locale),
    ...backgroundChanges(before.background, after.background, locale),
  ]) {
    if (label) labels.add(label);
  }
  for (const field of Object.keys(advancedLabels) as (keyof typeof advancedLabels)[]) {
    const label = advancedLabels[field];
    if (label && !equalAdvancedContentValue(before[field], after[field]))
      labels.add(actionCaption('Updated', translate(label, locale), locale));
  }
  for (const track of Object.keys(audioLabels) as (keyof typeof audioLabels)[]) {
    if (!equalAdvancedContentValue(before.audio[track], after.audio[track]))
      labels.add(actionCaption('Updated', translate(audioLabels[track], locale), locale));
  }
  return [...labels].join(' · ');
}

/** Describes the retained operation without exposing internal snapshot or field names. */
export function reviewEditHistoryTitle(operation: ReviewOperation, locale: AppLocale): string {
  if (operation.target === 'advancedContent')
    return (
      advancedHistoryTitle(operation.before, operation.after, locale) ||
      translate('gallery.videoReview.editHistoryTitle', locale)
    );
  if (operation.target === 'sourceAudio')
    return translate('gallery.videoReview.audioOriginal', locale);
  const edit = operation.target === 'edit' ? (operation.after ?? operation.before) : null;
  const subject = translate(
    edit
      ? editLabels[edit.kind]
      : operation.target === 'annotation'
        ? 'gallery.videoReview.annotationName'
        : 'gallery.videoReview.comments',
    locale
  );
  const action =
    operation.before === null ? 'Added' : operation.after === null ? 'Removed' : 'Updated';
  return actionCaption(action, subject, locale);
}
