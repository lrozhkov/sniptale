import { parseRecordingTelemetryEntry } from '../telemetry.guards';
import { isNativeHistoryPullState } from './transport-state';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  isCursorTrajectoryDescriptor,
  isTrajectoryInteger,
} from '../../../../features/video/project/cursor-trajectory/records';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import { cursorTrajectoryStagingIdentity } from '../cursor-trajectory/staging';
import { recordingEventsStagingIdentity } from '../recording-events/staging';
import type {
  NativeRecordingHistoryIntent,
  NativeRecordingHistoryOffer,
  NativeRecordingHistoryParent,
  NativeHistoryPublicationGrant,
} from './contracts';

const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const dimension = (value: unknown): value is number =>
  isTrajectoryInteger(value) && value >= 1 && value <= 0xffffffff;
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function writer(
  value: unknown,
  operationId: string,
  recordingId: string,
  streamId: string,
  cursor: boolean
) {
  if (
    !isPlainRecord(value) ||
    !exact(value, ['recordingId', cursor ? 'trajectoryId' : 'eventStreamId', 'writerGeneration']) ||
    !id(value['writerGeneration'])
  )
    return false;
  const expected = cursor
    ? cursorTrajectoryStagingIdentity(operationId, { recordingId, trajectoryId: streamId })
        .recordingId
    : recordingEventsStagingIdentity(operationId, { recordingId, eventStreamId: streamId })
        .recordingId;
  return (
    value['recordingId'] === expected &&
    value[cursor ? 'trajectoryId' : 'eventStreamId'] === streamId
  );
}
/** The base parent remains legacy-owned. Only validated identity and geometry grant history admission. */
export function isNativeRecordingHistoryParent(
  value: unknown
): value is NativeRecordingHistoryParent {
  return (
    isPlainRecord(value) &&
    value['kind'] === 'recording-complete' &&
    id(value['id']) &&
    id(value['controllerLeaseId']) &&
    hash(value['sha256']) &&
    isTrajectoryInteger(value['createdAt']) &&
    isTrajectoryInteger(value['updatedAt']) &&
    value['updatedAt'] >= value['createdAt'] &&
    isTrajectoryInteger(value['expiresAt']) &&
    isPlainRecord(value['metadata']) &&
    dimension(value['metadata']['width']) &&
    dimension(value['metadata']['height']) &&
    typeof value['metadata']['openEditor'] === 'boolean'
  );
}
export function isNativeRecordingHistoryOffer(
  value: unknown
): value is NativeRecordingHistoryOffer {
  return (
    isPlainRecord(value) &&
    Object.keys(value).every((key) =>
      [
        'recordingId',
        'controllerLeaseId',
        'videoSha256',
        'width',
        'height',
        'cursorTrajectory',
        'recordingEvents',
        'baseTelemetry',
      ].includes(key)
    ) &&
    id(value['recordingId']) &&
    id(value['controllerLeaseId']) &&
    hash(value['videoSha256']) &&
    dimension(value['width']) &&
    dimension(value['height']) &&
    (value['cursorTrajectory'] !== undefined || value['recordingEvents'] !== undefined) &&
    (value['baseTelemetry'] === undefined ||
      (isPlainRecord(value['baseTelemetry']) &&
        Array.isArray(value['baseTelemetry']['signals']) &&
        parseRecordingTelemetryEntry(value['baseTelemetry'])?.recordingId ===
          value['recordingId'])) &&
    (value['cursorTrajectory'] === undefined ||
      isCursorTrajectoryDescriptor(value['cursorTrajectory'])) &&
    (value['recordingEvents'] === undefined ||
      isRecordingEventsDescriptor(value['recordingEvents']))
  );
}
/** Closed private state. Its writer tokens never enter wire descriptors or project JSON. */
export function isNativeRecordingHistoryIntent(
  value: unknown
): value is NativeRecordingHistoryIntent {
  if (
    !isPlainRecord(value) ||
    !exact(value, [
      'version',
      'operationId',
      'revision',
      'recordingId',
      'recordingAssetId',
      'videoSha256',
      'controllerLeaseId',
      'width',
      'height',
      'createdAt',
      'updatedAt',
      'phase',
      'baseTelemetry',
      'cursor',
      'events',
    ]) ||
    value['version'] !== 1 ||
    !id(value['operationId']) ||
    !id(value['recordingId']) ||
    !id(value['recordingAssetId']) ||
    !id(value['controllerLeaseId']) ||
    !hash(value['videoSha256']) ||
    !isTrajectoryInteger(value['revision']) ||
    value['revision'] < 1 ||
    !isPlainRecord(value['baseTelemetry']) ||
    !Array.isArray(value['baseTelemetry']['signals']) ||
    parseRecordingTelemetryEntry(value['baseTelemetry'])?.recordingId !== value['recordingId'] ||
    !dimension(value['width']) ||
    !dimension(value['height']) ||
    !isTrajectoryInteger(value['createdAt']) ||
    !isTrajectoryInteger(value['updatedAt']) ||
    value['updatedAt'] < value['createdAt'] ||
    (value['phase'] !== 'pending' &&
      value['phase'] !== 'cancelled' &&
      value['phase'] !== 'complete') ||
    (value['cursor'] === null && value['events'] === null)
  )
    return false;
  const cursor = value['cursor'];
  if (
    cursor !== null &&
    (!isPlainRecord(cursor) ||
      !exact(cursor, ['descriptor', 'writer', 'pull']) ||
      !isCursorTrajectoryDescriptor(cursor['descriptor']) ||
      (cursor['pull'] !== null &&
        !isNativeHistoryPullState(cursor['pull'], cursor['descriptor'], true)) ||
      (cursor['writer'] === null
        ? !(cursor['descriptor'].finalized && cursor['descriptor'].totalBlocks === 0)
        : !writer(
            cursor['writer'],
            value['operationId'],
            value['recordingId'],
            cursor['descriptor'].trajectoryId,
            true
          )))
  )
    return false;
  const events = value['events'];
  return (
    events === null ||
    (isPlainRecord(events) &&
      exact(events, ['descriptor', 'writer', 'pull']) &&
      isRecordingEventsDescriptor(events['descriptor']) &&
      (events['pull'] === null ||
        isNativeHistoryPullState(events['pull'], events['descriptor'], false)) &&
      (events['writer'] === null
        ? events['descriptor'].finalized && events['descriptor'].totalBlocks === 0
        : writer(
            events['writer'],
            value['operationId'],
            value['recordingId'],
            events['descriptor'].eventStreamId,
            false
          )))
  );
}

/** A recovered journal can pin only one private stream from its original video assignment. */
export function isNativeHistoryPublicationGrant(
  value: unknown
): value is NativeHistoryPublicationGrant {
  if (
    !isPlainRecord(value) ||
    !exact(value, [
      'version',
      'operationId',
      'recordingId',
      'recordingAssetId',
      'videoSha256',
      'controllerLeaseId',
      'width',
      'height',
      'kind',
      'descriptor',
      'writer',
    ]) ||
    (value['kind'] !== 'cursor' && value['kind'] !== 'events')
  )
    return false;
  const base = {
    recordingId: value['recordingId'],
    createdAt: 0,
    updatedAt: 0,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
  };
  const slot = {
    descriptor: value['descriptor'],
    writer: value['writer'],
    pull: { kind: 'verified' },
  };
  return isNativeRecordingHistoryIntent({
    version: value['version'],
    operationId: value['operationId'],
    recordingId: value['recordingId'],
    recordingAssetId: value['recordingAssetId'],
    videoSha256: value['videoSha256'],
    controllerLeaseId: value['controllerLeaseId'],
    width: value['width'],
    height: value['height'],
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
    baseTelemetry: base,
    phase: 'pending',
    cursor: value['kind'] === 'cursor' ? slot : null,
    events: value['kind'] === 'events' ? slot : null,
  });
}

/** Expiry cannot remove a pending or malformed recovery authority. Explicit deletion is separate. */
export function canExpireNativeRecordingHistoryParent(value: unknown): boolean {
  if (!isPlainRecord(value) || !isPlainRecord(value['metadata'])) return false;
  if (value['metadata']['history'] === undefined)
    return (
      value['metadata']['cursorTrajectory'] === undefined &&
      value['metadata']['recordingEvents'] === undefined
    );
  return (
    isNativeRecordingHistoryParent(value) &&
    isNativeRecordingHistoryIntent(value.metadata.history) &&
    value.metadata.history.recordingId === value.id &&
    value.metadata.history.phase !== 'pending'
  );
}
