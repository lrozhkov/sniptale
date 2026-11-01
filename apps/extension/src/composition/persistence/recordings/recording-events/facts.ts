import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isTrajectoryInteger } from '../../../../features/video/project/cursor-trajectory/records';
import {
  decodeRecordingEventCadence,
  isRecordingEventRecord,
} from '../../../../features/video/project/recording-events/records';
import type { RecordingEventRecord } from '../../../../features/video/project/recording-events/types';
import {
  RecordingEventsError,
  type IndexedRecordingEvent,
  type RecordingEventsIdentity,
  type StoredRecordingEventFact,
} from './contracts';
import { isRecordingEventsIdentity } from './guards';
import { recordingEventIntervalBuckets } from './interval-index';

interface FactStore {
  get(query: IDBValidKey | IDBKeyRange): Promise<unknown>;
  put(value: StoredRecordingEventFact): Promise<unknown>;
  add(value: StoredRecordingEventFact): Promise<unknown>;
}
const factId = (record: IndexedRecordingEvent): string =>
  record.kind === 'action'
    ? `a:${record.action.id}`
    : record.kind === 'signal'
      ? `s:${record.signal.id}`
      : `c:${record.recordSeq}`;
const key = (identity: RecordingEventsIdentity, id: string) => [
  identity.recordingId,
  identity.eventStreamId,
  'fact',
  id,
];

function interval(record: IndexedRecordingEvent): readonly [number, number] {
  if (record.kind === 'signal') return [record.signal.startTimeUs, record.signal.endTimeUs];
  if (record.kind === 'keyboard-repeat-block') {
    const times = decodeRecordingEventCadence(record.cadence);
    if (!times) throw new RecordingEventsError('integrity');
    return [times[0]!, times.at(-1)!];
  }
  const action = record.action;
  const end = action.timeUs + action.durationUs;
  if (!isTrajectoryInteger(end)) throw new RecordingEventsError('integrity');
  const times = [action.timeUs, end];
  if (action.kind === 'KEY' || action.kind === 'CLICK') {
    for (const time of [
      action.data.downTimeUs,
      action.data.upTimeUs,
      action.data.lastObservedTimeUs,
    ])
      if (time !== null) times.push(time);
    if (action.kind === 'CLICK' && action.data.semanticEndTimeUs !== null)
      times.push(action.data.semanticEndTimeUs);
  }
  return [Math.min(...times), Math.max(...times)];
}
function indexFact(
  fact: Omit<StoredRecordingEventFact, 'fromTimeUs' | 'toTimeUs' | 'timeBuckets'>
): StoredRecordingEventFact {
  const [fromTimeUs, sourceEndTimeUs] = interval(fact.record);
  const toTimeUs = Math.max(sourceEndTimeUs, fact.observedThroughUs ?? sourceEndTimeUs);
  return {
    ...fact,
    fromTimeUs,
    toTimeUs,
    timeBuckets: recordingEventIntervalBuckets(fromTimeUs, toTimeUs).map(([level, index]) => [
      fact.recordingId,
      fact.eventStreamId,
      level,
      index,
    ]),
  };
}
export function admitStoredRecordingEventFact(
  value: unknown,
  identity: RecordingEventsIdentity
): StoredRecordingEventFact {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 11 ||
    !isRecordingEventsIdentity(value) ||
    value['recordingId'] !== identity.recordingId ||
    value['eventStreamId'] !== identity.eventStreamId ||
    value['kind'] !== 'fact' ||
    !isRecordingEventRecord(value['record']) ||
    !['action', 'signal', 'keyboard-repeat-block'].includes(value['record'].kind) ||
    !isTrajectoryInteger(value['revision']) ||
    !isTrajectoryInteger(value['admittedRepeatCount']) ||
    !(value['observedThroughUs'] === null || isTrajectoryInteger(value['observedThroughUs']))
  )
    throw new RecordingEventsError('integrity');
  const record = value['record'];
  if (
    record.kind !== 'action' &&
    record.kind !== 'signal' &&
    record.kind !== 'keyboard-repeat-block'
  )
    throw new RecordingEventsError('integrity');
  const expected = indexFact({
    recordingId: identity.recordingId,
    eventStreamId: identity.eventStreamId,
    kind: 'fact',
    entryId: factId(record),
    record,
    revision: value['revision'],
    observedThroughUs: value['observedThroughUs'],
    admittedRepeatCount: value['admittedRepeatCount'],
  });
  if (
    value['entryId'] !== expected.entryId ||
    value['fromTimeUs'] !== expected.fromTimeUs ||
    value['toTimeUs'] !== expected.toTimeUs ||
    JSON.stringify(value['timeBuckets']) !== JSON.stringify(expected.timeBuckets) ||
    (record.kind !== 'action' && value['revision'] !== 0)
  )
    throw new RecordingEventsError('integrity');
  return expected;
}

function openInput(record: IndexedRecordingEvent): boolean {
  return (
    record.kind === 'action' &&
    (record.action.kind === 'KEY' || record.action.kind === 'CLICK') &&
    record.action.data.downTimeUs !== null &&
    record.action.data.completion === 'observed'
  );
}

/** Runs inside the block owner's transaction. It never changes an earlier source block. */
export async function applyRecordingEventFact(
  store: FactStore,
  identity: RecordingEventsIdentity,
  record: RecordingEventRecord
): Promise<number> {
  identity = { recordingId: identity.recordingId, eventStreamId: identity.eventStreamId };
  if (record.kind === 'action-update') {
    const previous = admitStoredRecordingEventFact(
      await store.get(key(identity, `a:${record.actionId}`)),
      identity
    );
    if (
      previous.record.kind !== 'action' ||
      previous.record.recordSeq >= record.recordSeq ||
      (previous.revision === 0 ? record.revision !== 1 : record.revision <= previous.revision)
    )
      throw new RecordingEventsError('integrity');
    const action = previous.record.action;
    if (action.kind !== 'KEY' && action.kind !== 'CLICK')
      throw new RecordingEventsError('integrity');
    const merged = {
      ...previous.record,
      action: { ...action, data: { ...action.data, ...record.data } },
    };
    if (!isRecordingEventRecord(merged) || merged.kind !== 'action')
      throw new RecordingEventsError('integrity');
    if (merged.action.kind === 'KEY') {
      const completion = merged.action.data;
      const prior = action.kind === 'KEY' ? action.data.repeatCount : 0;
      if (completion.repeatCount < prior) throw new RecordingEventsError('integrity');
      if (
        (completion.completion === 'lost' || completion.completion === 'cancelled') &&
        completion.lastObservedTimeUs !== null &&
        (previous.observedThroughUs === null ||
          completion.lastObservedTimeUs > previous.observedThroughUs)
      )
        throw new RecordingEventsError('integrity');
    }
    const observed =
      merged.action.kind === 'KEY' || merged.action.kind === 'CLICK'
        ? merged.action.data.completion === 'observed'
          ? merged.action.data.lastObservedTimeUs
          : merged.action.data.upTimeUs
        : null;
    await store.put(
      indexFact({
        ...previous,
        record: merged,
        revision: record.revision,
        observedThroughUs:
          observed === null
            ? previous.observedThroughUs
            : Math.max(previous.observedThroughUs ?? 0, observed),
      })
    );
    return Number(openInput(merged)) - Number(openInput(previous.record));
  }
  if (
    record.kind !== 'action' &&
    record.kind !== 'signal' &&
    record.kind !== 'keyboard-repeat-block'
  )
    return 0;
  if (record.kind === 'keyboard-repeat-block') {
    const owner = admitStoredRecordingEventFact(
      await store.get(
        key(identity, `${record.ownerKind === 'action' ? 'a' : 's'}:${record.ownerId}`)
      ),
      identity
    );
    if (
      owner.record.recordSeq >= record.recordSeq ||
      (record.ownerKind === 'action'
        ? owner.record.kind !== 'action' || owner.record.action.kind !== 'KEY'
        : owner.record.kind !== 'signal' ||
          owner.record.signal.kind !== 'typing' ||
          owner.record.signal.data.privacy !== 'normal')
    )
      throw new RecordingEventsError('integrity');
    const times = decodeRecordingEventCadence(record.cadence);
    if (!times) throw new RecordingEventsError('integrity');
    const admittedRepeatCount =
      owner.admittedRepeatCount + (record.phase === 'repeat' ? times.length : 0);
    if (!isTrajectoryInteger(admittedRepeatCount)) throw new RecordingEventsError('integrity');
    await store.put(
      indexFact({
        ...owner,
        observedThroughUs: Math.max(owner.observedThroughUs ?? 0, times.at(-1)!),
        admittedRepeatCount,
      })
    );
  }
  let observedThroughUs: number | null = null;
  if (record.kind === 'action' && (record.action.kind === 'KEY' || record.action.kind === 'CLICK'))
    observedThroughUs = record.action.data.lastObservedTimeUs ?? record.action.data.downTimeUs;
  const fact = indexFact({
    ...identity,
    kind: 'fact',
    entryId: factId(record),
    record,
    revision: 0,
    observedThroughUs,
    admittedRepeatCount: 0,
  });
  // add refuses duplicate identities instead of replacing accepted history.
  await store.add(fact);
  return Number(openInput(record));
}
