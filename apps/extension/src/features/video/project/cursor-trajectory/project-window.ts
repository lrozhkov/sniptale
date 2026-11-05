import { getClipSourceObservationTime } from '../timeline/source-time';
import { evaluateCursorTrajectory } from './evaluate';
import type { VideoProject, VideoProjectCursorSample } from '../types';
import type {
  CursorTrajectoryDescriptor,
  CursorTrajectoryRecord,
  CursorTrajectorySegment,
} from './types';

interface CursorTrajectoryWindow {
  readonly fromTimeUs: number;
  readonly toTimeUs: number | null;
  readonly records: readonly CursorTrajectoryRecord[];
  readonly initialSegment: CursorTrajectorySegment | null;
}

interface PreparedWindow {
  readonly recordingId: string;
  readonly trajectoryId: string;
  readonly window: CursorTrajectoryWindow;
}

const windowsKey = Symbol('cursor-trajectory-render-windows');
const sourceKey = Symbol('cursor-trajectory-render-source');
interface CursorTrajectoryRenderProject extends VideoProject {
  readonly [windowsKey]?: readonly PreparedWindow[];
  readonly [sourceKey]?: VideoProject;
}

export type ReadCursorTrajectoryWindow = (
  identity: { recordingId: string; trajectoryId: string },
  descriptor: CursorTrajectoryDescriptor,
  activeTimeUs: number
) => Promise<CursorTrajectoryWindow | null>;

/** Loads only active source ranges. The caller retains the original project for save and authoring. */
export async function prepareCursorTrajectoryProject(
  project: VideoProject,
  time: number,
  read: ReadCursorTrajectoryWindow,
  previous?: VideoProject
): Promise<VideoProject> {
  const groups = project.cursorTrack?.sourceObservations?.filter((group) => group.trajectory);
  if (!groups?.length) return project;
  const prepared: PreparedWindow[] = [];
  for (const clip of project.clips) {
    if (clip.type !== 'VIDEO' || time < clip.startTime || time > clip.startTime + clip.duration)
      continue;
    const group = groups.find((item) => item.sourceInstanceId === clip.sourceInstanceId);
    const descriptor = group?.trajectory;
    if (!group || !descriptor || descriptor.totalBlocks === 0) continue;
    const sourceTime = getClipSourceObservationTime(clip, time);
    if (sourceTime === undefined) continue;
    const activeTimeUs = Math.round(sourceTime * 1_000_000);
    if (
      prepared.some(
        (item) =>
          item.recordingId === group.recordingId &&
          item.trajectoryId === descriptor.trajectoryId &&
          activeTimeUs >= item.window.fromTimeUs &&
          (item.window.toTimeUs === null || activeTimeUs < item.window.toTimeUs)
      )
    )
      continue;
    const window = await read(
      { recordingId: group.recordingId, trajectoryId: descriptor.trajectoryId },
      descriptor,
      activeTimeUs
    );
    if (window)
      prepared.push(
        Object.freeze({
          recordingId: group.recordingId,
          trajectoryId: descriptor.trajectoryId,
          window,
        })
      );
  }
  const result: CursorTrajectoryRenderProject = {
    ...project,
    [windowsKey]: Object.freeze(prepared),
    [sourceKey]: project,
  };
  const old: CursorTrajectoryRenderProject | undefined = previous;
  const oldWindows = old?.[windowsKey];
  if (
    old?.[sourceKey] === project &&
    oldWindows &&
    oldWindows.length === prepared.length &&
    prepared.every((item, index) => {
      const prior = oldWindows[index];
      return (
        prior?.recordingId === item.recordingId &&
        prior.trajectoryId === item.trajectoryId &&
        prior.window === item.window
      );
    })
  )
    return old;
  return result;
}

/** Checks whether an in-flight frame preparation also covers the current playhead. */
export function cursorTrajectoryProjectCoversTime(
  project: CursorTrajectoryRenderProject,
  time: number
): boolean {
  const groups = project.cursorTrack?.sourceObservations?.filter((group) => group.trajectory);
  if (!groups?.length) return true;
  return project.clips.every((clip) => {
    if (clip.type !== 'VIDEO' || time < clip.startTime || time > clip.startTime + clip.duration)
      return true;
    const group = groups.find((item) => item.sourceInstanceId === clip.sourceInstanceId);
    const descriptor = group?.trajectory;
    if (!group || !descriptor || descriptor.totalBlocks === 0) return true;
    const sourceTime = getClipSourceObservationTime(clip, time);
    if (sourceTime === undefined) return true;
    const activeTimeUs = Math.round(sourceTime * 1_000_000);
    return (project[windowsKey] ?? []).some(
      (item) =>
        item.recordingId === group.recordingId &&
        item.trajectoryId === descriptor.trajectoryId &&
        activeTimeUs >= item.window.fromTimeUs &&
        (item.window.toTimeUs === null || activeTimeUs < item.window.toTimeUs)
    );
  });
}

/** Already loaded adjacent records can prove native facts while the active read window refreshes. */
export function cursorTrajectoryProjectHasPreparedPosition(
  project: CursorTrajectoryRenderProject,
  time: number
): boolean {
  if (!Number.isFinite(time)) return false;
  const groups = project.cursorTrack?.sourceObservations;
  let found = false;
  for (const clip of project.clips) {
    if (clip.type !== 'VIDEO' || time < clip.startTime || time > clip.startTime + clip.duration)
      continue;
    const group = groups?.find((item) => item.sourceInstanceId === clip.sourceInstanceId);
    const descriptor = group?.trajectory;
    if (!group || !descriptor || descriptor.totalBlocks === 0) continue;
    found = true;
    const sourceTime = getClipSourceObservationTime(clip, time);
    if (sourceTime === undefined) return false;
    const activeTimeUs = Math.round(sourceTime * 1_000_000);
    if (
      !(project[windowsKey] ?? []).some(
        (item) =>
          item.recordingId === group.recordingId &&
          item.trajectoryId === descriptor.trajectoryId &&
          evaluateCursorTrajectory(
            item.window.records,
            activeTimeUs,
            item.window.initialSegment
          ) !== null
      )
    )
      return false;
  }
  return found;
}

/** A render-only fact cache. No window grants interpolation into another window or a gap. */
export function resolvePreparedCursorTrajectoryPosition(
  project: CursorTrajectoryRenderProject,
  recordingId: string,
  trajectoryId: string,
  sourceTime: number
) {
  const activeTimeUs = Math.round(sourceTime * 1_000_000);
  for (const item of project[windowsKey] ?? []) {
    const window = item.window;
    if (
      item.recordingId !== recordingId ||
      item.trajectoryId !== trajectoryId ||
      activeTimeUs < window.fromTimeUs ||
      (window.toTimeUs !== null && activeTimeUs >= window.toTimeUs)
    )
      continue;
    return evaluateCursorTrajectory(window.records, activeTimeUs, window.initialSegment);
  }
  return null;
}

const sourceWindows = new WeakMap<CursorTrajectoryWindow, PreparedCursorSourceWindow>();
interface PreparedCursorSourceWindow {
  readonly samples: readonly VideoProjectCursorSample[];
  readonly knownEndSeconds: number;
}
/** Adapts already read canonical points. It cannot extend their coverage to the video end. */
export function preparedCursorTrajectorySourceWindow(
  project: CursorTrajectoryRenderProject,
  recordingId: string,
  trajectoryId: string
): PreparedCursorSourceWindow | undefined {
  const window = project[windowsKey]?.find(
    (item) => item.recordingId === recordingId && item.trajectoryId === trajectoryId
  )?.window;
  if (!window) return undefined;
  const cached = sourceWindows.get(window);
  if (cached) return cached;
  const samples: VideoProjectCursorSample[] = [];
  let active = window.initialSegment;
  let knownEndSeconds = 0;
  for (const record of window.records) {
    const time = (record.kind === 'gap' ? record.fromTimeUs : record.activeTimeUs) / 1000000;
    knownEndSeconds = Math.max(knownEndSeconds, time);
    if (record.kind === 'segment') {
      active = record;
      continue;
    }
    if (record.kind === 'sample') {
      if (!active || active.segmentId !== record.segmentId)
        throw new Error('Cursor source segment is unavailable.');
      const point =
        record.observed && record.visible && record.xQ8 !== null && record.yQ8 !== null
          ? Object.freeze({
              x: record.xQ8 / (256 * active.width),
              y: record.yQ8 / (256 * active.height),
            })
          : null;
      samples.push(
        Object.freeze({
          id: JSON.stringify(['trajectory', trajectoryId, record.observationSeq]),
          time,
          x: record.xQ8 === null ? 0 : record.xQ8 / 256,
          y: record.yQ8 === null ? 0 : record.yQ8 / 256,
          visible: point !== null,
          recordingPoint: point,
          captureSegment: record.segmentId,
          observation: point ? 'observed' : record.observed ? 'outside' : 'blur',
          interpolation: 'LINEAR',
        })
      );
      continue;
    }
    samples.push(
      Object.freeze({
        id: JSON.stringify([
          'trajectory-boundary',
          trajectoryId,
          record.segmentId,
          time,
          record.reason,
        ]),
        time,
        x: 0,
        y: 0,
        visible: false,
        recordingPoint: null,
        captureSegment: record.segmentId,
        observation: record.kind === 'boundary' && record.reason === 'pause' ? 'paused' : 'blur',
      })
    );
    if (record.kind === 'gap' && record.toTimeUs !== null)
      knownEndSeconds = Math.max(knownEndSeconds, record.toTimeUs / 1000000);
    active = null;
  }
  const result = Object.freeze({ samples: Object.freeze(samples), knownEndSeconds });
  sourceWindows.set(window, result);
  return result;
}
