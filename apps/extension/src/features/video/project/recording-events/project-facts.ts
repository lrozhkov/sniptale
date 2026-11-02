import type { VideoProjectActionFeedback } from '../action-feedback/types';
import type {
  VideoProject,
  VideoProjectActionEvent,
  RecordingTelemetrySignal,
  RecordingActionEvent,
} from '../types';
import type {
  RecordingEventRecord,
  RecordingEventCadence,
  RecordingEventsDescriptor,
} from './types';

export type RecordingEventWindowRecord = Extract<
  RecordingEventRecord,
  { kind: 'action' | 'signal' | 'keyboard-repeat-block' }
>;
export interface PreparedRecordingEventGroup {
  recordingId: string;
  sourceInstanceId: string;
  eventStreamId: string;
  descriptor: RecordingEventsDescriptor;
  writerGeneration: string;
  actions: readonly VideoProjectActionEvent[];
  signals: readonly RecordingTelemetrySignal[];
  cadence: ReadonlyMap<
    string,
    { onsets: RecordingEventCadence[]; repeats: RecordingEventCadence[] }
  >;
}
const windowsKey = Symbol('recording-event-render-windows');
interface RenderProject extends VideoProject {
  readonly [windowsKey]?: {
    start: number;
    end: number;
    groups: readonly PreparedRecordingEventGroup[];
    clips: VideoProject['clips'];
    assets: VideoProject['assets'];
    duration: number;
    reach: readonly (number | undefined)[];
  };
}
const refKey = (kind: 'action' | 'signal', id: string) => JSON.stringify([kind, id]);
const seconds = (value: number) => value / 1_000_000;

/** Maps scalar source metadata without inventing missing edges or lowering clock precision. */
function metadata(data: object): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(data)) {
    const value: unknown = Reflect.get(data, key);
    if (key === 'upPoint') continue;
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      result[key.endsWith('Us') ? key.slice(0, -2) : key] =
        key.endsWith('Us') && typeof value === 'number' ? seconds(value) : value;
    }
  }
  return result;
}

type ActionRecord = Extract<RecordingEventRecord, { kind: 'action' }>;
type SignalRecord = Extract<RecordingEventRecord, { kind: 'signal' }>;
const actionRecordKey = Symbol('recording-action-source-fact');
const signalRecordKey = Symbol('recording-signal-source-fact');
interface SourceAction extends VideoProjectActionEvent {
  readonly [actionRecordKey]?: ActionRecord;
}
interface SourceSignal extends RecordingTelemetrySignal {
  readonly [signalRecordKey]?: SignalRecord;
}

/** Projects one validated source action without adding missing observations. */
export function projectRecordingEventAction(
  identity: Pick<
    VideoProjectActionFeedback,
    'recordingId' | 'sourceInstanceId' | 'actionOverrides'
  >,
  record: ActionRecord
): VideoProjectActionEvent {
  const action = record.action;
  const data: VideoProjectActionEvent['data'] = {
    ...metadata(action.data),
    captureSegment: record.segmentId,
  };
  if (action.kind === 'KEY') data['combo'] = action.label;
  if (action.kind === 'CLICK' && action.data.upPoint) {
    data['upX'] = action.data.upPoint.x;
    data['upY'] = action.data.upPoint.y;
  }
  const event: SourceAction = {
    id: JSON.stringify([
      'recording-event',
      identity.recordingId,
      identity.sourceInstanceId,
      action.id,
    ]),
    kind: action.kind,
    label: action.label,
    data,
    point: action.point ? { ...action.point } : null,
    capturedDuration: seconds(action.durationUs),
    anchor: {
      kind: 'recording-source',
      recordingId: identity.recordingId,
      sourceInstanceId: identity.sourceInstanceId,
      sourceEventId: action.id,
      sourceTime: seconds(action.timeUs),
    },
    [actionRecordKey]: record,
  };
  const presentation = identity.actionOverrides?.find(
    (item) => item.id === action.id
  )?.presentation;
  return presentation ? { ...event, presentation } : event;
}

/** Converts retained source actions for review without applying presentation edits. */
export function recordingSourceActionFacts(event: VideoProjectActionEvent): RecordingActionEvent[] {
  const anchor = event.anchor;
  if (anchor.kind !== 'recording-source') return [];
  return [
    {
      id: anchor.sourceEventId,
      kind: event.kind,
      time: anchor.sourceTime,
      duration: event.capturedDuration ?? 0,
      point: event.point,
      recordingPoint: event.point,
      label: event.label,
      data: event.data,
      preset: 'NONE',
      ...(event.keyboardRepeats ? { keyboardRepeats: event.keyboardRepeats } : {}),
    },
  ];
}

/** Keeps source signal semantics, including anonymous holds and nullable aggregates. */
export function projectRecordingEventSignal(record: SignalRecord): RecordingTelemetrySignal {
  const signal = record.signal;
  const result: SourceSignal = {
    id: signal.id,
    kind: signal.kind === 'keyboard-hold' ? 'typing' : signal.kind,
    startTime: seconds(signal.startTimeUs),
    endTime: seconds(signal.endTimeUs),
    point: signal.point ? { ...signal.point } : null,
    recordingPoint: signal.point ? { ...signal.point } : null,
    data: {
      ...metadata(signal.data),
      captureSegment: record.segmentId,
      ...(signal.kind === 'keyboard-hold' ? { keyboardHold: true } : {}),
    },
    [signalRecordKey]: record,
  };
  return result;
}

/** Returns the original derived fact only for source-adapted action values. */
export function recordingEventActionRecord(
  event: VideoProjectActionEvent
): ActionRecord | undefined {
  const value: SourceAction = event;
  return value[actionRecordKey];
}
/** Returns the original derived fact only for source-adapted signal values. */
export function recordingEventSignalRecord(
  signal: RecordingTelemetrySignal
): SignalRecord | undefined {
  const value: SourceSignal = signal;
  return value[signalRecordKey];
}

export function projectRecordingEventGroup(
  group: VideoProjectActionFeedback,
  records: readonly RecordingEventWindowRecord[],
  writerGeneration: string
): PreparedRecordingEventGroup {
  const actions: VideoProjectActionEvent[] = [];
  const signals: RecordingTelemetrySignal[] = [];
  const cadence = new Map<
    string,
    { onsets: RecordingEventCadence[]; repeats: RecordingEventCadence[] }
  >();
  for (const record of records) {
    if (record.kind === 'action')
      actions.push(
        projectRecordingEventAction(
          { recordingId: group.recordingId, sourceInstanceId: group.sourceInstanceId },
          record
        )
      );
    else if (record.kind === 'signal') signals.push(projectRecordingEventSignal(record));
    else {
      const key = refKey(record.ownerKind, record.ownerId);
      const blocks = cadence.get(key) ?? { onsets: [], repeats: [] };
      (record.phase === 'onset' ? blocks.onsets : blocks.repeats).push(
        structuredClone(record.cadence)
      );
      cadence.set(key, blocks);
    }
  }
  return {
    recordingId: group.recordingId,
    sourceInstanceId: group.sourceInstanceId,
    eventStreamId: group.events!.eventStreamId,
    descriptor: structuredClone(group.events!),
    writerGeneration,
    actions,
    signals,
    cadence,
  };
}

/** Attaches complete, disposable fact windows without adding JSON fields to the document. */
export function attachRecordingEventGroups(
  project: VideoProject,
  range: { start: number; end: number },
  groups: readonly PreparedRecordingEventGroup[]
): VideoProject {
  const result: RenderProject = {
    ...project,
    [windowsKey]: {
      ...range,
      groups,
      clips: project.clips,
      assets: project.assets,
      duration: project.duration,
      reach: feedbackReach(project),
    },
  };
  return result;
}

/** Includes authored reach without reading source history. */
export function recordingEventAuthoredReach(project: VideoProject) {
  let duration = project.actionPresentation?.duration ?? 0;
  let offset = Math.abs(project.actionPresentation?.offset ?? 0);
  for (const group of project.actionFeedback ?? [])
    for (const item of group.actionOverrides ?? []) {
      duration = Math.max(duration, item.presentation.duration ?? 0);
      offset = Math.max(offset, Math.abs(item.presentation.offset ?? 0));
    }
  return duration + offset;
}
function feedbackReach(project: VideoProject) {
  return [
    project.actionPresentation?.duration,
    project.actionPresentation?.offset,
    project.actionPresentation?.clickSuppressionInterval,
    recordingEventAuthoredReach(project),
  ];
}
function windowFor(project: RenderProject) {
  const window = project[windowsKey];
  return window &&
    window.clips === project.clips &&
    window.assets === project.assets &&
    window.duration === project.duration &&
    window.reach.every((value, index) => value === feedbackReach(project)[index])
    ? window
    : undefined;
}
function matchingGroups(project: RenderProject) {
  return (windowFor(project)?.groups ?? []).filter((prepared) => {
    const descriptor = project.actionFeedback?.find(
      (group) =>
        group.recordingId === prepared.recordingId &&
        group.sourceInstanceId === prepared.sourceInstanceId
    )?.events;
    return (
      descriptor !== undefined &&
      (
        [
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
        ] as const
      ).every((key) => descriptor[key] === prepared.descriptor[key])
    );
  });
}
function preparedGroup(
  project: RenderProject,
  group: Pick<VideoProjectActionFeedback, 'recordingId' | 'sourceInstanceId'>
) {
  return matchingGroups(project).find(
    (item) =>
      item.recordingId === group.recordingId && item.sourceInstanceId === group.sourceInstanceId
  );
}
/** Returns bounded render facts plus persisted authored/legacy actions. */
export function recordingEventProjectActions(
  project: RenderProject
): readonly VideoProjectActionEvent[] {
  const groups = matchingGroups(project);
  return groups.length
    ? [
        ...project.actionEvents,
        ...groups.flatMap((group) => {
          const settings = project.actionFeedback?.find(
            (item) =>
              item.recordingId === group.recordingId &&
              item.sourceInstanceId === group.sourceInstanceId
          );
          const overrides = new Map(
            settings?.actionOverrides?.map((item) => [item.id, item.presentation])
          );
          return group.actions.map((event) => {
            const presentation =
              event.anchor.kind === 'recording-source'
                ? overrides.get(event.anchor.sourceEventId)
                : undefined;
            return presentation ? { ...event, presentation } : event;
          });
        }),
      ]
    : project.actionEvents;
}
/** Returns source signals for one feedback instance without changing its saved group. */
export function recordingEventProjectSignals(
  project: RenderProject,
  group: VideoProjectActionFeedback
): readonly RecordingTelemetrySignal[] {
  return group.events ? (preparedGroup(project, group)?.signals ?? []) : group.signals;
}
/** Direct microsecond cadence never passes through the legacy millisecond encoder. */
export function recordingEventProjectCadence(
  project: RenderProject,
  group: VideoProjectActionFeedback,
  kind: 'action' | 'signal',
  id: string
) {
  return preparedGroup(project, group)?.cadence.get(refKey(kind, id));
}
/** Checks the requested main-time range, not the padded source query ranges. */
export function recordingEventsProjectCoversTime(project: RenderProject, time: number): boolean {
  if (!project.actionFeedback?.some((group) => group.events && group.events.totalBlocks > 0))
    return true;
  const window = windowFor(project);
  if (!window || time < window.start || time > window.end) return false;
  const groups = matchingGroups(project);
  return (project.actionFeedback ?? []).every(
    (group) =>
      !group.events ||
      group.events.totalBlocks === 0 ||
      !project.clips.some(
        (clip) =>
          clip.type === 'VIDEO' &&
          clip.sourceInstanceId === group.sourceInstanceId &&
          time >= clip.startTime &&
          time <= clip.startTime + clip.duration
      ) ||
      groups.some(
        (item) =>
          item.recordingId === group.recordingId && item.sourceInstanceId === group.sourceInstanceId
      )
  );
}

/** Job owners pin these immutable source generations across separate time windows. */
export function recordingEventProjectSources(project: RenderProject) {
  return matchingGroups(project).map((group) => ({
    recordingId: group.recordingId,
    eventStreamId: group.eventStreamId,
    writerGeneration: group.writerGeneration,
  }));
}
