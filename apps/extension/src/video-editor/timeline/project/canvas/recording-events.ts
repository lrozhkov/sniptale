import { useEffect, useMemo, useState } from 'react';
import {
  useRecordingHistoryReadLifetime,
  runRecordingHistoryReads,
} from '../../../runtime/recording-history-reader';
import { createRecordingEventsRenderer } from '../../../../workflows/video-review/recording-events';
import type { VideoProject } from '../../../../features/video/project/types';

interface Request {
  project: VideoProject;
  start: number;
  end: number;
  retry: number;
}
interface Completion {
  request: Request;
  project: VideoProject | null;
}
const matches = (left: Request, right: Request) =>
  left.project === right.project &&
  left.start === right.start &&
  left.end === right.end &&
  left.retry === right.retry;

/** The timeline owns one active read and one replaceable viewport request. */
export function useTimelineRecordingEvents(
  project: VideoProject,
  viewport: { startTime: number; endTime: number },
  pixelsPerSecond: number,
  createRenderer = createRecordingEventsRenderer
) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [completed, setCompleted] = useState<Completion | null>(null);
  const enabled =
    project.actionFeedback?.some((group) => group.events && group.events.totalBlocks > 0) === true;
  const overscan = 120 / pixelsPerSecond;
  const start = Math.max(0, viewport.startTime - overscan);
  const end = Math.max(start, viewport.endTime + overscan);
  const owner = useMemo(
    () => ({
      renderer: createRenderer(),
      active: false,
      epoch: 0,
      running: false,
      pending: null as Request | null,
      latest: null as Request | null,
    }),
    [createRenderer]
  );
  const latest = { project, start, end, retry: retryVersion };
  owner.latest = latest;
  useRecordingHistoryReadLifetime(owner);
  useEffect(() => {
    if (!enabled) return;
    owner.pending = { project, start, end, retry: retryVersion };
    runRecordingHistoryReads(owner, async (request, epoch) => {
      const current = () =>
        owner.active &&
        owner.epoch === epoch &&
        owner.latest !== null &&
        matches(request, owner.latest);
      try {
        const prepared = await owner.renderer.prepare(request.project, {
          start: request.start,
          end: request.end,
        });
        if (current()) setCompleted({ request, project: prepared });
      } catch {
        if (current()) setCompleted({ request, project: null });
      }
    });
  }, [owner, enabled, project, start, end, retryVersion]);
  const result = completed && matches(completed.request, latest) ? completed : null;
  return {
    project: enabled ? (result?.project ?? project) : project,
    status: !enabled
      ? ('ready' as const)
      : !result
        ? ('loading' as const)
        : result.project
          ? ('ready' as const)
          : ('failed' as const),
    retry: () => setRetryVersion((value) => value + 1),
  };
}
