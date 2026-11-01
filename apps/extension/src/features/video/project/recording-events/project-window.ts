import { getVideoProjectActionPresentation } from '../action-presentation';
import { getVideoProjectFeedbackRuns } from '../action-feedback/projection';
import { mapProjectTimeToSourcePoint } from '../timeline/source-time';
import type { VideoProject } from '../types';
import type { RecordingEventsDescriptor } from './types';
import {
  attachRecordingEventGroups,
  recordingEventAuthoredReach,
  projectRecordingEventGroup,
  type RecordingEventWindowRecord,
  type PreparedRecordingEventGroup,
} from './project-facts';

export interface RecordingEventRange {
  recordingId: string;
  eventStreamId: string;
  fromTimeUs: number;
  toTimeUs: number;
}
export interface RecordingEventWindow {
  writerGeneration: string;
  records: readonly RecordingEventWindowRecord[];
}
export type ReadRecordingEventRange = (
  range: RecordingEventRange,
  descriptor: RecordingEventsDescriptor
) => Promise<RecordingEventWindow>;
/** A complete requested time window, with original source records kept outside saved project fields. */
export async function prepareRecordingEventsProject(
  project: VideoProject,
  range: { start: number; end: number },
  read: ReadRecordingEventRange
): Promise<VideoProject> {
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start < 0 ||
    range.end < range.start
  )
    throw new Error('Recording event render range is invalid.');
  const groups = project.actionFeedback?.filter((group) => group.events);
  if (!groups?.length) return project;
  const defaults = getVideoProjectActionPresentation(project);
  // Captured key/click styles permit at most five seconds after plus a two-second offset.
  // Legacy project defaults and suppression can request a larger, explicitly authored reach.
  const padding = Math.max(
    7,
    defaults.duration + Math.abs(defaults.offset),
    recordingEventAuthoredReach(project),
    defaults.clickSuppressionInterval
  );
  const prepared: PreparedRecordingEventGroup[] = [];
  for (const group of groups) {
    const descriptor = group.events!;
    if (descriptor.totalBlocks === 0) continue;
    const ranges: [number, number][] = [];
    for (const { clips } of getVideoProjectFeedbackRuns(project, group))
      for (const clip of clips) {
        const from = Math.max(range.start, clip.startTime);
        const to = Math.min(range.end, clip.startTime + clip.duration);
        if (to < from) continue;
        const first = mapProjectTimeToSourcePoint([clip], from, clip.id)?.sourceTime;
        const last = mapProjectTimeToSourcePoint([clip], to, clip.id)?.sourceTime;
        if (first === undefined || last === undefined) continue;
        const reach = padding * (clip.playbackRate ?? 1);
        ranges.push([
          Math.max(0, Math.floor((Math.min(first, last) - reach) * 1_000_000)),
          Math.min(Number.MAX_SAFE_INTEGER, Math.ceil((Math.max(first, last) + reach) * 1_000_000)),
        ]);
      }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const item of ranges) {
      const previous = merged.at(-1);
      if (previous && item[0] <= previous[1]) previous[1] = Math.max(previous[1], item[1]);
      else merged.push([...item]);
    }
    let generation: string | undefined;
    const records = new Map<number, RecordingEventWindowRecord>();
    for (const [fromTimeUs, toTimeUs] of merged) {
      const window = await read(
        {
          recordingId: group.recordingId,
          eventStreamId: descriptor.eventStreamId,
          fromTimeUs,
          toTimeUs,
        },
        descriptor
      );
      if (generation !== undefined && generation !== window.writerGeneration)
        throw new Error('Recording event source changed during render preparation.');
      generation = window.writerGeneration;
      for (const record of window.records) records.set(record.recordSeq, record);
    }
    if (generation !== undefined)
      prepared.push(
        projectRecordingEventGroup(
          group,
          [...records.values()].sort((a, b) => a.recordSeq - b.recordSeq),
          generation
        )
      );
  }
  return attachRecordingEventGroups(project, range, prepared);
}
