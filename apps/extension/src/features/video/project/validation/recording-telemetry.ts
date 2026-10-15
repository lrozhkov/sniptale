import {
  isRecordingKeyboardRhythmBlocks,
  areRecordingKeyboardRhythmBlocksWithin,
} from '../keyboard-rhythm';
import type {
  RecordingTelemetrySignal,
  RecordingObservationClock,
  RecordingTelemetryCapabilities,
  RecordingTelemetryProvenance,
  RecordingViewportGeometry,
  RecordingViewportObservation,
  RecordingPointTransform,
  RecordingActionEvent,
  VideoProjectCursorTrack,
} from '../types';
import {
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';

type RecordingTelemetryViewportInfo = {
  devicePixelRatio: number;
  height: number;
  outerHeight?: number;
  outerWidth?: number;
  scrollX: number;
  scrollY: number;
  viewportOffsetX?: number;
  viewportOffsetY?: number;
  visualViewportScale?: number;
  width: number;
};

function hasOptionalField<TRecord extends Record<string, unknown>>(
  record: TRecord,
  key: string,
  validator: (value: unknown) => boolean
): boolean {
  return record[key] === undefined || validator(record[key]);
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isNumber(value['x']) && isNumber(value['y']);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

export function isViewportInfo(value: unknown): value is RecordingTelemetryViewportInfo {
  return (
    isRecord(value) &&
    isNumber(value['width']) &&
    value['width'] > 0 &&
    isNumber(value['height']) &&
    value['height'] > 0 &&
    isNumber(value['scrollX']) &&
    isNumber(value['scrollY']) &&
    isNumber(value['devicePixelRatio']) &&
    value['devicePixelRatio'] > 0 &&
    hasOptionalField(value, 'outerWidth', isNumber) &&
    hasOptionalField(value, 'outerHeight', isNumber) &&
    hasOptionalField(value, 'viewportOffsetX', isNumber) &&
    hasOptionalField(value, 'viewportOffsetY', isNumber) &&
    hasOptionalField(value, 'visualViewportScale', isNumber)
  );
}

export function isVideoProjectCursorTrack(value: unknown): value is VideoProjectCursorTrack {
  return (
    isRecord(value) &&
    isString(value['captureMode']) &&
    isRecord(value['skin']) &&
    hasOptionalField(value['skin'], 'animationPreset', isString) &&
    isString(value['skin']['color']) &&
    isBoolean(value['skin']['hidden']) &&
    hasOptionalField(value['skin'], 'preset', isString) &&
    isNumber(value['skin']['scale']) &&
    isBoolean(value['skin']['shadow']) &&
    Array.isArray(value['samples']) &&
    value['samples'].every(
      (sample) =>
        isRecord(sample) &&
        isString(sample['id']) &&
        hasOptionalField(sample, 'observationClockId', isClockIdentifier) &&
        isNonNegativeNumber(sample['time']) &&
        isNumber(sample['x']) &&
        isNumber(sample['y']) &&
        isBoolean(sample['visible']) &&
        (sample['recordingPoint'] === undefined ||
          sample['recordingPoint'] === null ||
          isRecordingPoint(sample['recordingPoint'])) &&
        (sample['captureSegment'] === undefined ||
          (typeof sample['captureSegment'] === 'number' &&
            Number.isSafeInteger(sample['captureSegment']) &&
            sample['captureSegment'] >= 0)) &&
        (sample['observation'] === undefined ||
          (isString(sample['observation']) &&
            ['observed', 'outside', 'hidden', 'blur', 'paused'].includes(sample['observation'])))
    )
  );
}

export function isRecordingActionEvent(value: unknown): value is RecordingActionEvent {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['kind']) &&
    isNonNegativeNumber(value['time']) &&
    isNonNegativeNumber(value['duration']) &&
    isString(value['label']) &&
    isString(value['preset']) &&
    isRecord(value['data']) &&
    isRecordingInteractionMetadata(value['data']) &&
    hasOptionalField(value, 'keyboardRepeats', isRecordingKeyboardRhythmBlocks) &&
    (value['keyboardRepeats'] === undefined ||
      areRecordingKeyboardRhythmBlocksWithin(
        value['keyboardRepeats'],
        typeof value['data']['downTime'] === 'number' ? value['data']['downTime'] : value['time'],
        typeof value['data']['upTime'] === 'number'
          ? value['data']['upTime']
          : typeof value['data']['lastObservedTime'] === 'number'
            ? value['data']['lastObservedTime']
            : 86400
      )) &&
    (value['recordingPoint'] === undefined ||
      value['recordingPoint'] === null ||
      isRecordingPoint(value['recordingPoint'])) &&
    (value['point'] === null || isPoint(value['point']))
  );
}

export function isRecordingTelemetrySignal(value: unknown): value is RecordingTelemetrySignal {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['kind']) &&
    isNonNegativeNumber(value['startTime']) &&
    isNonNegativeNumber(value['endTime']) &&
    value['endTime'] >= value['startTime'] &&
    isRecord(value['data']) &&
    isRecordingInteractionMetadata(value['data']) &&
    (value['keyboardRhythm'] === undefined ||
      areRecordingKeyboardRhythmBlocksWithin(
        value['keyboardRhythm'],
        value['startTime'],
        value['endTime']
      )) &&
    (value['keyboardRepeats'] === undefined ||
      areRecordingKeyboardRhythmBlocksWithin(
        value['keyboardRepeats'],
        value['startTime'],
        value['endTime']
      )) &&
    haveDisjointRhythmIdentities(value['keyboardRhythm'], value['keyboardRepeats']) &&
    (value['data']['privacy'] !== 'protected' || isProtectedActivitySignal(value)) &&
    (value['recordingPoint'] === undefined ||
      value['recordingPoint'] === null ||
      isRecordingPoint(value['recordingPoint'])) &&
    (value['point'] === null || isPoint(value['point']))
  );
}

export function isRecordingTelemetrySnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOptionalField(value, 'capabilities', isRecordingTelemetryCapabilities) &&
    hasOptionalField(value, 'observationClock', isRecordingObservationClock) &&
    hasOptionalField(value, 'provenance', isRecordingTelemetryProvenance) &&
    (value['viewportObservation'] === undefined ||
      value['viewportObservation'] === null ||
      isRecordingViewportObservation(value['viewportObservation'])) &&
    (value['viewport'] === null || isViewportInfo(value['viewport'])) &&
    (value['cursorTrack'] === null || isVideoProjectCursorTrack(value['cursorTrack'])) &&
    Array.isArray(value['actionEvents']) &&
    value['actionEvents'].every(isRecordingActionEvent) &&
    (value['signals'] === undefined ||
      (Array.isArray(value['signals']) && value['signals'].every(isRecordingTelemetrySignal)))
  );
}

export function isRecordingPoint(value: unknown): value is { x: number; y: number } {
  return (
    isRecord(value) &&
    isNumber(value['x']) &&
    isNumber(value['y']) &&
    Number.isFinite(value['x']) &&
    Number.isFinite(value['y']) &&
    value['x'] >= 0 &&
    value['x'] <= 1 &&
    value['y'] >= 0 &&
    value['y'] <= 1
  );
}

function isRecordingViewportGeometry(value: unknown): value is RecordingViewportGeometry {
  return (
    isRecord(value) &&
    ['width', 'height', 'devicePixelRatio', 'visualViewportScale'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] > 0
    ) &&
    ['visualViewportOffsetX', 'visualViewportOffsetY'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key])
    )
  );
}

function isRecordingViewportObservation(value: unknown): value is RecordingViewportObservation {
  return (
    isRecord(value) && isRecordingViewportGeometry(value['initial']) && isBoolean(value['stable'])
  );
}

export function isRecordingPointTransform(value: unknown): value is RecordingPointTransform {
  if (
    !isRecord(value) ||
    !isRecordingViewportGeometry(value['viewport']) ||
    !isRecord(value['visibleClientRect'])
  )
    return false;
  const viewport = value['viewport'];
  const rect = value['visibleClientRect'];
  return (
    viewport.visualViewportScale === 1 &&
    viewport.visualViewportOffsetX === 0 &&
    viewport.visualViewportOffsetY === 0 &&
    ['scaleX', 'scaleY'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] > 0
    ) &&
    ['offsetX', 'offsetY'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key])
    ) &&
    ['x', 'y', 'width', 'height'].every(
      (key) => typeof rect[key] === 'number' && Number.isFinite(rect[key])
    ) &&
    Number(rect['x']) >= 0 &&
    Number(rect['y']) >= 0 &&
    Number(rect['width']) > 0 &&
    Number(rect['height']) > 0 &&
    Number(rect['x']) + Number(rect['width']) <= viewport.width &&
    Number(rect['y']) + Number(rect['height']) <= viewport.height
  );
}

/** Explicit observation support, independent from whether an action was delivered. */
function isRecordingTelemetryCapabilities(value: unknown): value is RecordingTelemetryCapabilities {
  return (
    isRecord(value) &&
    value['version'] === 1 &&
    hasOptionalField(value, 'timing', isRecordingTiming) &&
    ['pointer', 'keyboard', 'wheel'].every(
      (key) =>
        value[key] === 'available' || value[key] === 'unavailable' || value[key] === 'unknown'
    ) &&
    (value['coverage'] === 'document' ||
      value['coverage'] === 'desktop' ||
      value['coverage'] === 'unknown') &&
    Object.keys(value).every((key) =>
      ['version', 'pointer', 'keyboard', 'wheel', 'coverage', 'timing'].includes(key)
    )
  );
}

/** Keeps the released native normalization contract while admitting explicit browser source facts. */
export function isRecordingTelemetryProvenance(
  value: unknown
): value is RecordingTelemetryProvenance {
  return (
    isRecord(value) &&
    value['normalizationVersion'] === 1 &&
    value['timeUnit'] === 'seconds' &&
    ((value['source'] === 'native' && value['coordinateSpace'] === 'desktop') ||
      (value['source'] === 'browser' && value['coordinateSpace'] === 'client-css')) &&
    Object.keys(value).every((key) =>
      ['source', 'normalizationVersion', 'timeUnit', 'coordinateSpace'].includes(key)
    )
  );
}

/** Admits newly consumed source gesture facts without assigning meaning to legacy metadata. */
export function isRecordingInteractionMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    hasOptionalField(value, 'observationClockId', isClockIdentifier) &&
    hasValidInteractionTimes(value) &&
    hasValidInteractionCoordinates(value) &&
    hasValidMouseGesture(value) &&
    hasValidKeyboardAttack(value)
  );
}

function hasValidInteractionTimes(value: Record<string, unknown>): boolean {
  const fields = [
    'downTime',
    'upTime',
    'pressDuration',
    'lastObservedTime',
    'semanticEndTime',
    'dragStartTime',
    'keyboardOnsetTime',
  ];
  if (
    !fields.every(
      (key) =>
        value[key] === undefined || (isNumber(value[key]) && value[key] >= 0 && value[key] <= 86400)
    )
  )
    return false;
  const down = value['downTime'],
    up = value['upTime'],
    duration = value['pressDuration'];
  if (up !== undefined && (typeof down !== 'number' || typeof up !== 'number' || up < down))
    return false;
  return (
    duration === undefined ||
    (typeof up === 'number' &&
      typeof down === 'number' &&
      typeof duration === 'number' &&
      Math.abs(duration - (up - down)) <= 0.001)
  );
}

function hasValidInteractionCoordinates(value: Record<string, unknown>): boolean {
  return (
    ['downX', 'downY', 'upX', 'upY'].every(
      (key) => value[key] === undefined || isNumber(value[key])
    ) &&
    ['recordingUpX', 'recordingUpY'].every(
      (key) =>
        value[key] === undefined || (isNumber(value[key]) && value[key] >= 0 && value[key] <= 1)
    )
  );
}

function hasValidMouseGesture(value: Record<string, unknown>): boolean {
  if (value['gestureId'] === undefined) return true;
  const id = value['gestureId'],
    button = value['button'];
  if (
    !isString(id) ||
    id.length < 1 ||
    id.length > 128 ||
    !Number.isSafeInteger(button) ||
    typeof button !== 'number' ||
    button < 0 ||
    button > 31
  )
    return false;
  if (
    !['click', 'hold', 'drag', 'selection', 'native-drag'].some(
      (kind) => value['gestureType'] === kind
    ) ||
    !['released', 'lost', 'cancelled', 'semantic'].some((kind) => value['completion'] === kind)
  )
    return false;
  if (
    !['downTime', 'downX', 'downY', 'maxExcursionCssPx'].every((key) => isNumber(value[key])) ||
    typeof value['maxExcursionCssPx'] !== 'number' ||
    value['maxExcursionCssPx'] < 0
  )
    return false;
  if (
    value['completion'] === 'released' &&
    !['upTime', 'pressDuration', 'upX', 'upY'].every((key) => isNumber(value[key]))
  )
    return false;
  return value['completion'] !== 'semantic' || isNumber(value['semanticEndTime']);
}

function hasValidKeyboardAttack(value: Record<string, unknown>): boolean {
  const count = value['repeatCount'],
    id = value['keyboardAttackId'];
  if (
    count !== undefined &&
    (!Number.isSafeInteger(count) || typeof count !== 'number' || count < 0)
  )
    return false;
  return (
    id === undefined ||
    (isString(id) && id.length >= 1 && id.length <= 128 && isNumber(value['keyboardOnsetTime']))
  );
}

/** A signal owns one attack identity namespace across physical and repeat cadence blocks. */
function haveDisjointRhythmIdentities(onsets: unknown, repeats: unknown): boolean {
  if (onsets === undefined || repeats === undefined) return true;
  if (!isRecordingKeyboardRhythmBlocks(onsets) || !isRecordingKeyboardRhythmBlocks(repeats))
    return false;
  const onsetIds = new Set(onsets.map((block) => block.id));
  return repeats.every((block) => !onsetIds.has(block.id));
}

/** The new protected discriminator admits activity coverage only, never exact input facts. */
function isProtectedActivitySignal(value: Record<string, unknown>): boolean {
  const data = value['data'];
  return (
    isRecord(data) &&
    value['kind'] === 'typing' &&
    value['point'] === null &&
    Number.isSafeInteger(value['startTime']) &&
    (value['recordingPoint'] === undefined || value['recordingPoint'] === null) &&
    value['keyboardRhythm'] === undefined &&
    value['keyboardRepeats'] === undefined &&
    data['activity'] === 'input' &&
    typeof data['captureSegment'] === 'number' &&
    Number.isSafeInteger(data['captureSegment']) &&
    data['captureSegment'] >= 0 &&
    Object.keys(data).every((key) =>
      ['privacy', 'activity', 'captureSegment', 'observationClockId'].includes(key)
    )
  );
}

function isClockIdentifier(value: unknown): value is string {
  return isString(value) && value.length > 0 && value.length <= 200;
}

function isRecordingTiming(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['mode'] === 'bounded' || value['mode'] === 'approximate') &&
    (value['accuracyMs'] === null || isNonNegativeNumber(value['accuracyMs'])) &&
    Object.keys(value).every((key) => ['mode', 'accuracyMs'].includes(key))
  );
}

/** Optional v1 document clocks are retained by storage and explicit backup without changing schemas. */
function isRecordingObservationClock(value: unknown): value is RecordingObservationClock {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    (value['domain'] !== 'observation' && value['domain'] !== 'media') ||
    !Array.isArray(value['segments']) ||
    value['segments'].length > 10000 ||
    !Object.keys(value).every((key) => ['version', 'domain', 'segments'].includes(key))
  )
    return false;
  const ids = new Set<string>();
  return value['segments'].every((segment) => {
    if (
      !isRecord(segment) ||
      !isClockIdentifier(segment['id']) ||
      ids.has(segment['id']) ||
      !isClockIdentifier(segment['documentId']) ||
      ![
        'timeOriginMs',
        'startedAtTimestampMs',
        'observationStartSeconds',
        'mediaStartEstimateSeconds',
      ].every(
        (key) => isNonNegativeNumber(segment[key]) && segment[key] <= Number.MAX_SAFE_INTEGER
      ) ||
      !['observationStartSeconds', 'mediaStartEstimateSeconds'].every(
        (key) => isNonNegativeNumber(segment[key]) && segment[key] <= 86400
      ) ||
      !hasOptionalField(
        segment,
        'mediaEndSeconds',
        (value) => isNonNegativeNumber(value) && value <= 86400
      ) ||
      !Object.keys(segment).every((key) =>
        [
          'id',
          'documentId',
          'timeOriginMs',
          'startedAtTimestampMs',
          'observationStartSeconds',
          'mediaStartEstimateSeconds',
          'mapping',
          'mediaEndSeconds',
        ].includes(key)
      )
    )
      return false;
    ids.add(segment['id']);
    const mapping = segment['mapping'];
    return (
      mapping === null ||
      (isRecord(mapping) &&
        ['captureEpochMs', 'mediaTimeSeconds', 'uncertaintyMs'].every(
          (key) => isNonNegativeNumber(mapping[key]) && mapping[key] <= Number.MAX_SAFE_INTEGER
        ) &&
        isNonNegativeNumber(mapping['mediaTimeSeconds']) &&
        mapping['mediaTimeSeconds'] <= 86400 &&
        hasOptionalField(mapping, 'maximumUncertaintyMs', isNonNegativeNumber) &&
        Object.keys(mapping).every((key) =>
          ['captureEpochMs', 'mediaTimeSeconds', 'uncertaintyMs', 'maximumUncertaintyMs'].includes(
            key
          )
        ))
    );
  });
}
