import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  CursorTrajectoryDescriptor,
  CursorTrajectoryRecord,
  CursorTrajectorySegment,
} from './types';

const boundaryReasons = [
  'pause',
  'stop',
  'visibility',
  'observation',
  'geometry',
  'clock-discontinuity',
  'zero-time-discontinuity',
];
const segmentReasons = [
  'start',
  'resume',
  'visibility',
  'observation',
  'geometry',
  'clock-discontinuity',
  'zero-time-discontinuity',
  'after-gap',
];
const anchorValues = [
  'start',
  'stop',
  'before-button',
  'after-button',
  'visibility',
  'observation',
  'pause',
  'resume',
  'geometry',
  'gap',
  'discontinuity',
];

/** The canonical integer range is shared with Rust and the JSON transport. */
export function isTrajectoryInteger(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
  );
}

function nullableInteger(value: unknown): boolean {
  return value === null || isTrajectoryInteger(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function member(value: unknown, values: readonly string[]): boolean {
  return typeof value === 'string' && values.includes(value);
}

/** Both browser transport and canonical segment records use this exact clock shape. */
export function isCursorTrajectoryClock(value: unknown): value is CursorTrajectorySegment['clock'] {
  return (
    isPlainRecord(value) &&
    exactKeys(value, [
      'source',
      'timestampQuantumUs',
      'resolutionBoundUs',
      'mappingUncertaintyUs',
    ]) &&
    member(value['source'], ['windows-message-time', 'dom-event-time']) &&
    nullableInteger(value['timestampQuantumUs']) &&
    value['timestampQuantumUs'] !== 0 &&
    nullableInteger(value['resolutionBoundUs']) &&
    nullableInteger(value['mappingUncertaintyUs'])
  );
}

/** Closed record shapes exclude private fields before canonical encoding or persistence. */
export function isCursorTrajectoryRecord(value: unknown): value is CursorTrajectoryRecord {
  if (!isPlainRecord(value) || !isTrajectoryInteger(value['segmentId'])) return false;
  switch (value['kind']) {
    case 'segment': {
      const clock = value['clock'];
      return (
        exactKeys(value, [
          'kind',
          'segmentId',
          'activeTimeUs',
          'width',
          'height',
          'clock',
          'reason',
        ]) &&
        isTrajectoryInteger(value['activeTimeUs']) &&
        isTrajectoryInteger(value['width']) &&
        value['width'] > 0 &&
        value['width'] <= 0xffffffff &&
        isTrajectoryInteger(value['height']) &&
        value['height'] > 0 &&
        value['height'] <= 0xffffffff &&
        member(value['reason'], segmentReasons) &&
        isCursorTrajectoryClock(clock)
      );
    }
    case 'sample': {
      const anchors = value['anchors'];
      const related = value['relatedObservationSeq'];
      if (
        !Array.isArray(anchors) ||
        !anchors.every((anchor: unknown): anchor is string => typeof anchor === 'string')
      )
        return false;
      return (
        exactKeys(value, [
          'kind',
          'segmentId',
          'observationSeq',
          'activeTimeUs',
          'xQ8',
          'yQ8',
          'observed',
          'visible',
          'event',
          'button',
          'relatedObservationSeq',
          'anchors',
        ]) &&
        isTrajectoryInteger(value['activeTimeUs']) &&
        isTrajectoryInteger(value['observationSeq']) &&
        typeof value['visible'] === 'boolean' &&
        typeof value['observed'] === 'boolean' &&
        (value['observed']
          ? isTrajectoryInteger(value['xQ8']) && isTrajectoryInteger(value['yQ8'])
          : value['xQ8'] === null && value['yQ8'] === null) &&
        member(value['event'], ['move', 'down', 'up', 'click']) &&
        member(value['button'], ['none', 'left', 'middle', 'right', 'x1', 'x2']) &&
        (related === null ||
          (value['event'] === 'click' &&
            isTrajectoryInteger(related) &&
            related < value['observationSeq'])) &&
        anchors.length <= anchorValues.length &&
        anchors.every(
          (anchor, index) =>
            member(anchor, anchorValues) && (index === 0 || anchors[index - 1]! < anchor)
        )
      );
    }
    case 'boundary':
      return (
        exactKeys(value, ['kind', 'segmentId', 'activeTimeUs', 'reason']) &&
        isTrajectoryInteger(value['activeTimeUs']) &&
        member(value['reason'], boundaryReasons)
      );
    case 'gap': {
      const first = value['firstLostObservationSeq'];
      const last = value['lastLostObservationSeq'];
      return (
        exactKeys(value, [
          'kind',
          'segmentId',
          'fromTimeUs',
          'toTimeUs',
          'firstLostObservationSeq',
          'lastLostObservationSeq',
          'reason',
        ]) &&
        isTrajectoryInteger(value['fromTimeUs']) &&
        (value['toTimeUs'] === null ||
          (isTrajectoryInteger(value['toTimeUs']) && value['toTimeUs'] >= value['fromTimeUs'])) &&
        ((first === null && last === null) ||
          (isTrajectoryInteger(first) && isTrajectoryInteger(last) && last >= first)) &&
        member(value['reason'], [
          'input-overflow',
          'writer-backpressure',
          'source-unavailable',
          'storage-failure',
          'clock-discontinuity',
        ])
      );
    }
    default:
      return false;
  }
}

/** Coordinate validation uses the admitted source geometry, including across block boundaries. */
export function trajectoryRecordFitsSegment(
  record: CursorTrajectoryRecord,
  segment: CursorTrajectorySegment | null
): boolean {
  if (record.kind === 'segment') return true;
  if (!segment || segment.segmentId !== record.segmentId) return false;
  return (
    record.kind !== 'sample' ||
    !record.observed ||
    (record.xQ8 !== null &&
      record.yQ8 !== null &&
      record.xQ8 < segment.width * 256 &&
      record.yQ8 < segment.height * 256)
  );
}

/** Open gaps contribute their start to block bounds without acquiring a fabricated end. */
export function trajectoryRecordTimes(record: CursorTrajectoryRecord): readonly [number, number] {
  return record.kind === 'gap'
    ? [record.fromTimeUs, record.toTimeUs ?? record.fromTimeUs]
    : [record.activeTimeUs, record.activeTimeUs];
}

/** Descriptor counts never allocate buffers. Attachment readers validate each bounded block. */
export function isCursorTrajectoryDescriptor(value: unknown): value is CursorTrajectoryDescriptor {
  if (
    !isPlainRecord(value) ||
    !exactKeys(value, [
      'format',
      'formatVersion',
      'algorithm',
      'encoding',
      'trajectoryId',
      'state',
      'finalized',
      'totalBlocks',
      'totalRecords',
      'totalSamples',
      'totalBytes',
      'streamSha256',
    ])
  )
    return false;
  const { totalBlocks, totalRecords, totalSamples, totalBytes } = value;
  return (
    value['format'] === 'cursor-trajectory-v1' &&
    value['formatVersion'] === 1 &&
    value['algorithm'] === 'sed-window-v1' &&
    value['encoding'] === 'json-ascii-int-v1' &&
    typeof value['trajectoryId'] === 'string' &&
    /^[a-f0-9]{32}$/.test(value['trajectoryId']) &&
    member(value['state'], ['complete', 'incomplete', 'unavailable']) &&
    typeof value['finalized'] === 'boolean' &&
    isTrajectoryInteger(totalBlocks) &&
    isTrajectoryInteger(totalRecords) &&
    isTrajectoryInteger(totalSamples) &&
    isTrajectoryInteger(totalBytes) &&
    totalSamples <= totalRecords &&
    totalRecords >= totalBlocks &&
    totalRecords <= totalBlocks * 512 &&
    totalBytes >= totalBlocks &&
    totalBytes <= totalBlocks * 65536 &&
    (totalBlocks !== 0 ||
      (totalRecords === 0 &&
        totalSamples === 0 &&
        totalBytes === 0 &&
        value['streamSha256'] ===
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')) &&
    typeof value['streamSha256'] === 'string' &&
    /^[a-f0-9]{64}$/.test(value['streamSha256']) &&
    (value['state'] !== 'unavailable' ||
      (value['finalized'] &&
        totalBlocks === 0 &&
        totalRecords === 0 &&
        totalSamples === 0 &&
        totalBytes === 0 &&
        value['streamSha256'] ===
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'))
  );
}
