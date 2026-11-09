import {
  hasExactKeys,
  isStringMember,
  isPlainRecord,
} from '@sniptale/runtime-contracts/validation/primitives';
import { RECORDING_EVENT_LABELS } from './types';
import { isCursorTrajectoryClock, isTrajectoryInteger } from '../cursor-trajectory/records';
import type {
  RecordingEventCadence,
  RecordingEventRecord,
  RecordingEventsDescriptor,
} from './types';

const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const streamPattern = /^[a-f0-9]{32}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const modifierKeys = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'];
const keyCompletionKeys = [
  'upTimeUs',
  'pressDurationUs',
  'lastObservedTimeUs',
  'repeatCount',
  'completion',
];
const clickCompletionKeys = [
  'gestureType',
  'completion',
  'upTimeUs',
  'pressDurationUs',
  'lastObservedTimeUs',
  'semanticEndTimeUs',
  'dragStartTimeUs',
  'pointerCancelled',
  'dropObserved',
  'upPoint',
  ...modifierKeys,
];
const warningCodes: Readonly<Record<string, readonly string[]>> = {
  'keyboard-hook': [
    'events-dropped',
    'drain-failed',
    'signal-record-failed',
    'event-record-failed',
    'blocked',
    'permission-denied',
    'policy-denied',
    'install-failed',
  ],
  'mouse-hook': [
    'events-dropped',
    'drain-failed',
    'signal-record-failed',
    'event-record-failed',
    'blocked',
    'permission-denied',
    'policy-denied',
    'install-failed',
  ],
  'cursor-telemetry': ['idle-signal-record-failed'],
  'cursor-trajectory': ['format-unavailable'],
  'recording-events': [
    'format-unavailable',
    'input-overflow',
    'writer-backpressure',
    'storage-failure',
    'source-unavailable',
    'clock-discontinuity',
    'unknown-record',
    'oversize-record',
    'counter-overflow',
  ],
};

function identifier(value: unknown): value is string {
  return typeof value === 'string' && idPattern.test(value);
}
function nullableId(value: unknown): boolean {
  return value === null || identifier(value);
}
function nullableInteger(value: unknown): boolean {
  return value === null || isTrajectoryInteger(value);
}
function nullableBoolean(value: unknown): boolean {
  return value === null || typeof value === 'boolean';
}
function nullableFinite(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}
function point(value: unknown): boolean {
  return (
    value === null ||
    (isPlainRecord(value) &&
      hasExactKeys(value, ['x', 'y']) &&
      ['x', 'y'].every(
        (key) =>
          typeof value[key] === 'number' &&
          Number.isFinite(value[key]) &&
          value[key] >= 0 &&
          value[key] <= 1
      ))
  );
}
function modifiers(data: Record<string, unknown>): boolean {
  return modifierKeys.every((key) => nullableBoolean(data[key]));
}
function keyCompletion(data: Record<string, unknown>): boolean {
  return (
    ['upTimeUs', 'pressDurationUs', 'lastObservedTimeUs'].every((key) =>
      nullableInteger(data[key])
    ) &&
    isTrajectoryInteger(data['repeatCount']) &&
    isStringMember(data['completion'], ['observed', 'released', 'lost', 'cancelled']) &&
    (data['completion'] === 'released' ||
      (data['upTimeUs'] === null && data['pressDurationUs'] === null)) &&
    (data['pressDurationUs'] === null || data['upTimeUs'] !== null)
  );
}
function clickCompletion(data: Record<string, unknown>): boolean {
  return (
    (data['gestureType'] === null ||
      isStringMember(data['gestureType'], ['click', 'hold', 'drag', 'selection', 'native-drag'])) &&
    isStringMember(data['completion'], ['observed', 'released', 'lost', 'cancelled', 'semantic']) &&
    [
      'upTimeUs',
      'pressDurationUs',
      'lastObservedTimeUs',
      'semanticEndTimeUs',
      'dragStartTimeUs',
    ].every((key) => nullableInteger(data[key])) &&
    nullableBoolean(data['pointerCancelled']) &&
    nullableBoolean(data['dropObserved']) &&
    point(data['upPoint']) &&
    modifiers(data) &&
    (!isStringMember(data['completion'], ['lost', 'cancelled', 'observed']) ||
      (data['upTimeUs'] === null &&
        data['pressDurationUs'] === null &&
        data['upPoint'] === null)) &&
    (data['pressDurationUs'] === null || data['upTimeUs'] !== null)
  );
}
/** Admits the closed browser/native command grammar without retaining typed text. */
export function isSafeRecordingKeyLabel(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 120) return false;
  const parts = value.split('+');
  const modifier = (part: string) => ['Ctrl', 'Alt', 'Shift', 'Meta'].includes(part);
  if (parts.every(modifier)) return parts.length <= 4 && new Set(parts).size === parts.length;
  const terminal = parts.pop();
  if (
    !terminal ||
    parts.length > 4 ||
    !parts.every(modifier) ||
    new Set(parts).size !== parts.length
  )
    return false;
  return (
    isStringMember(terminal, [
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'Backspace',
      'Delete',
      'End',
      'Enter',
      'Escape',
      'Home',
      'PageDown',
      'PageUp',
      'Insert',
      'Space',
      'Tab',
      'Unknown',
    ]) ||
    /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(terminal) ||
    (/^[A-Z0-9]$/.test(terminal) && parts.some((part) => ['Ctrl', 'Alt', 'Meta'].includes(part)))
  );
}
function action(value: unknown): boolean {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'kind',
      'timeUs',
      'durationUs',
      'point',
      'label',
      'data',
      'preset',
    ]) ||
    !identifier(value['id']) ||
    !isTrajectoryInteger(value['timeUs']) ||
    !isTrajectoryInteger(value['durationUs']) ||
    !point(value['point']) ||
    value['preset'] !== 'NONE' ||
    !isPlainRecord(value['data'])
  )
    return false;
  const data = value['data'];
  switch (value['kind']) {
    case 'KEY':
      return (
        isSafeRecordingKeyLabel(value['label']) &&
        hasExactKeys(data, [
          ...keyCompletionKeys,
          'downTimeUs',
          'keyboardAttackId',
          'keyboardOnsetTimeUs',
          'groupId',
          'continuationOf',
          ...modifierKeys,
        ]) &&
        keyCompletion(data) &&
        modifiers(data) &&
        nullableInteger(data['downTimeUs']) &&
        nullableInteger(data['keyboardOnsetTimeUs']) &&
        ['keyboardAttackId', 'groupId', 'continuationOf'].every((key) => nullableId(data[key]))
      );
    case 'CLICK':
      return (
        value['label'] === RECORDING_EVENT_LABELS.CLICK &&
        hasExactKeys(data, [
          ...clickCompletionKeys,
          'button',
          'gestureId',
          'downTimeUs',
          'clickCount',
        ]) &&
        clickCompletion(data) &&
        isTrajectoryInteger(data['button']) &&
        data['button'] <= 31 &&
        nullableId(data['gestureId']) &&
        nullableInteger(data['downTimeUs']) &&
        isTrajectoryInteger(data['clickCount']) &&
        data['clickCount'] > 0
      );
    case 'SCROLL': {
      if (
        value['label'] !== RECORDING_EVENT_LABELS.SCROLL ||
        !hasExactKeys(data, [
          'eventType',
          'deltaX',
          'deltaY',
          'deltaZ',
          'deltaMode',
          'scrollX',
          'scrollY',
          ...modifierKeys,
        ]) ||
        !modifiers(data) ||
        !['deltaX', 'deltaY', 'deltaZ', 'scrollX', 'scrollY'].every((key) =>
          nullableFinite(data[key])
        ) ||
        !(
          data['deltaMode'] === null ||
          (isTrajectoryInteger(data['deltaMode']) && data['deltaMode'] <= 2)
        )
      )
        return false;
      if (data['eventType'] === 'wheel')
        return ['deltaX', 'deltaY', 'deltaZ', 'deltaMode'].every((key) => data[key] !== null);
      if (data['eventType'] === 'scroll')
        return (
          ['deltaX', 'deltaY', 'deltaZ', 'deltaMode'].every((key) => data[key] === null) &&
          data['scrollX'] !== null &&
          data['scrollY'] !== null
        );
      return (
        data['eventType'] === null &&
        ['deltaX', 'deltaY', 'deltaZ', 'deltaMode', 'scrollX', 'scrollY'].every(
          (key) => data[key] === null
        )
      );
    }
    case 'PAUSE':
      return (
        value['label'] === 'Pause' &&
        hasExactKeys(data, ['phase']) &&
        isStringMember(data['phase'], ['pause', 'resume'])
      );
    default:
      return false;
  }
}
function signal(value: unknown): boolean {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['id', 'kind', 'startTimeUs', 'endTimeUs', 'point', 'data']) ||
    !identifier(value['id']) ||
    !isTrajectoryInteger(value['startTimeUs']) ||
    !isTrajectoryInteger(value['endTimeUs']) ||
    value['endTimeUs'] < value['startTimeUs'] ||
    !point(value['point']) ||
    !isPlainRecord(value['data'])
  )
    return false;
  const data = value['data'];
  switch (value['kind']) {
    case 'typing':
      if (
        !hasExactKeys(data, ['eventCount', 'activity', 'privacy', 'groupId', 'continuationOf']) ||
        !isStringMember(data['activity'], ['keyboard', 'input']) ||
        !nullableId(data['groupId']) ||
        !nullableId(data['continuationOf'])
      )
        return false;
      if (data['privacy'] === 'protected')
        return (
          data['eventCount'] === null &&
          data['groupId'] === null &&
          data['continuationOf'] === null &&
          value['point'] === null &&
          value['startTimeUs'] % 1_000_000 === 0 &&
          value['endTimeUs'] % 1_000_000 === 0
        );
      return (
        isStringMember(data['privacy'], ['normal', 'unknown']) &&
        isTrajectoryInteger(data['eventCount']) &&
        data['eventCount'] > 0 &&
        (data['privacy'] !== 'unknown' || value['point'] === null)
      );
    case 'keyboard-hold': {
      if (
        !hasExactKeys(data, [...keyCompletionKeys, 'privacy', 'downTimeUs']) ||
        data['privacy'] !== 'normal' ||
        value['point'] !== null ||
        data['completion'] === 'observed' ||
        !keyCompletion(data) ||
        !nullableInteger(data['downTimeUs']) ||
        (data['downTimeUs'] !== null && data['downTimeUs'] !== value['startTimeUs']) ||
        (data['upTimeUs'] !== null && data['upTimeUs'] !== value['endTimeUs']) ||
        (data['lastObservedTimeUs'] !== null && data['lastObservedTimeUs'] !== value['endTimeUs'])
      )
        return false;
      const down = data['downTimeUs'];
      const up = data['upTimeUs'];
      const duration = data['pressDurationUs'];
      return (
        duration === null ||
        (typeof down === 'number' && typeof up === 'number' && up >= down && duration === up - down)
      );
    }
    case 'cursor-idle':
      return (
        hasExactKeys(data, ['source']) &&
        isStringMember(data['source'], ['native-cursor', 'browser-cursor'])
      );
    case 'static-frame':
      return (
        hasExactKeys(data, ['source', 'code', 'severity']) &&
        data['severity'] === 'warning' &&
        typeof data['code'] === 'string' &&
        (data['source'] === null
          ? data['code'] === 'source-unavailable'
          : typeof data['source'] === 'string' &&
            Object.hasOwn(warningCodes, data['source']) &&
            (warningCodes[data['source']]?.includes(data['code']) ?? false))
      );
    default:
      return false;
  }
}

/** Encodes source microseconds. The unit does not claim one-microsecond clock accuracy. */
export function encodeRecordingEventCadence(
  id: string,
  timesUs: readonly number[]
): RecordingEventCadence {
  if (!identifier(id) || timesUs.length < 1 || timesUs.length > 512)
    throw new Error('Invalid recording event cadence.');
  const startTimeUs = timesUs[0]!;
  let previous = startTimeUs;
  const ticks = timesUs.map((time) => {
    if (!isTrajectoryInteger(time) || time < previous)
      throw new Error('Invalid recording event cadence time.');
    const delta = time - previous;
    previous = time;
    return delta;
  });
  return {
    version: 1,
    id,
    startTimeUs,
    quantumUs: 1,
    count: timesUs.length,
    encoding: 'delta-us',
    ticks,
  };
}

/** Decodes bounded cadence without guessing a repeat rate or changing source times. */
export function decodeRecordingEventCadence(value: unknown): number[] | null {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'id',
      'startTimeUs',
      'quantumUs',
      'count',
      'encoding',
      'ticks',
    ]) ||
    value['version'] !== 1 ||
    !identifier(value['id']) ||
    !isTrajectoryInteger(value['startTimeUs']) ||
    value['quantumUs'] !== 1 ||
    !isTrajectoryInteger(value['count']) ||
    value['count'] < 1 ||
    value['count'] > 512 ||
    !Array.isArray(value['ticks']) ||
    value['ticks'].length < 1 ||
    value['ticks'].length > 1024 ||
    !value['ticks'].every(isTrajectoryInteger) ||
    value['ticks'][0] !== 0
  )
    return null;
  const ticks = value['ticks'];
  let time = value['startTimeUs'];
  const result: number[] = [];
  const append = (delta: number, count: number): boolean => {
    if (count < 1 || count > 512 - result.length) return false;
    for (let i = 0; i < count; i++) {
      time += delta;
      if (!isTrajectoryInteger(time)) return false;
      result.push(time);
    }
    return true;
  };
  if (value['encoding'] === 'delta-us') {
    for (const delta of ticks) if (!append(delta, 1)) return null;
  } else if (value['encoding'] === 'rle-us' && ticks.length % 2 === 0) {
    for (let i = 0; i < ticks.length; i += 2) {
      const delta = ticks[i];
      const count = ticks[i + 1];
      if (delta === undefined || count === undefined || !append(delta, count)) return null;
    }
  } else return null;
  return result.length === value['count'] ? result : null;
}

/** Admits closed source facts. Cross-record identities and lifecycle require the stream reader. */
export function isRecordingEventRecord(value: unknown): value is RecordingEventRecord {
  if (
    !isPlainRecord(value) ||
    !['recordSeq', 'segmentId', 'activeTimeUs'].every((key) => isTrajectoryInteger(value[key]))
  )
    return false;
  const base = ['kind', 'recordSeq', 'segmentId', 'activeTimeUs'];
  switch (value['kind']) {
    case 'segment':
      return (
        hasExactKeys(value, [...base, 'clock', 'reason']) &&
        isCursorTrajectoryClock(value['clock']) &&
        isStringMember(value['reason'], [
          'start',
          'resume',
          'visibility',
          'privacy',
          'clock-discontinuity',
          'after-gap',
        ])
      );
    case 'boundary':
      return (
        hasExactKeys(value, [...base, 'reason']) &&
        isStringMember(value['reason'], [
          'pause',
          'stop',
          'visibility',
          'privacy',
          'clock-discontinuity',
        ])
      );
    case 'action':
      return hasExactKeys(value, [...base, 'action']) && action(value['action']);
    case 'action-update':
      return (
        hasExactKeys(value, [...base, 'actionId', 'revision', 'data']) &&
        identifier(value['actionId']) &&
        isTrajectoryInteger(value['revision']) &&
        value['revision'] > 0 &&
        isPlainRecord(value['data']) &&
        ((hasExactKeys(value['data'], keyCompletionKeys) && keyCompletion(value['data'])) ||
          (hasExactKeys(value['data'], clickCompletionKeys) && clickCompletion(value['data'])))
      );
    case 'signal':
      return hasExactKeys(value, [...base, 'signal']) && signal(value['signal']);
    case 'keyboard-repeat-block':
      return (
        hasExactKeys(value, [...base, 'ownerKind', 'ownerId', 'phase', 'cadence']) &&
        isStringMember(value['ownerKind'], ['action', 'signal']) &&
        identifier(value['ownerId']) &&
        isStringMember(value['phase'], ['onset', 'repeat']) &&
        decodeRecordingEventCadence(value['cadence']) !== null
      );
    case 'gap': {
      const first = value['firstLostSourceSeq'];
      const last = value['lastLostSourceSeq'];
      const count = value['lostCount'];
      return (
        hasExactKeys(value, [
          ...base,
          'source',
          'fromTimeUs',
          'toTimeUs',
          'firstLostSourceSeq',
          'lastLostSourceSeq',
          'lostCount',
          'reason',
        ]) &&
        isStringMember(value['source'], ['keyboard', 'signal', 'producer']) &&
        isTrajectoryInteger(value['fromTimeUs']) &&
        nullableInteger(value['toTimeUs']) &&
        (value['toTimeUs'] === null ||
          (isTrajectoryInteger(value['toTimeUs']) && value['toTimeUs'] >= value['fromTimeUs'])) &&
        ((first === null && last === null && count === null) ||
          (isTrajectoryInteger(first) &&
            isTrajectoryInteger(last) &&
            last >= first &&
            isTrajectoryInteger(count) &&
            count > 0 &&
            count === last - first + 1)) &&
        isStringMember(value['reason'], [
          'input-overflow',
          'writer-backpressure',
          'storage-failure',
          'source-unavailable',
          'clock-discontinuity',
          'unknown-record',
          'oversize-record',
          'counter-overflow',
        ])
      );
    }
    default:
      return false;
  }
}

export function isRecordingEventsDescriptor(value: unknown): value is RecordingEventsDescriptor {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'format',
      'formatVersion',
      'algorithm',
      'encoding',
      'eventStreamId',
      'state',
      'finalized',
      'totalBlocks',
      'totalRecords',
      'totalBytes',
      'streamSha256',
    ])
  )
    return false;
  return (
    value['format'] === 'recording-events-v1' &&
    value['formatVersion'] === 1 &&
    value['algorithm'] === 'lossless-v1' &&
    value['encoding'] === 'json-utf8-v1' &&
    typeof value['eventStreamId'] === 'string' &&
    streamPattern.test(value['eventStreamId']) &&
    isStringMember(value['state'], ['complete', 'incomplete', 'unavailable']) &&
    typeof value['finalized'] === 'boolean' &&
    (value['state'] !== 'unavailable' || value['finalized']) &&
    isTrajectoryInteger(value['totalBlocks']) &&
    isTrajectoryInteger(value['totalRecords']) &&
    isTrajectoryInteger(value['totalBytes']) &&
    value['totalRecords'] >= value['totalBlocks'] &&
    value['totalRecords'] <= value['totalBlocks'] * 512 &&
    value['totalBytes'] >= value['totalBlocks'] &&
    value['totalBytes'] <= value['totalBlocks'] * 65_536 &&
    (value['totalBlocks'] !== 0 ||
      (value['totalRecords'] === 0 &&
        value['totalBytes'] === 0 &&
        value['streamSha256'] ===
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')) &&
    typeof value['streamSha256'] === 'string' &&
    digestPattern.test(value['streamSha256'])
  );
}

export type { RecordingEventCadence };
