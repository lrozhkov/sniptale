import { useEffect, useMemo, useState } from 'react';
import {
  useRecordingHistoryReadLifetime,
  runRecordingHistoryReads,
} from '../../../runtime/recording-history-reader';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createRecordingCursorTrajectoryRenderer } from '../../../../workflows/video-review/cursor-trajectory';
import { cursorTrajectoryProjectCoversTime } from '../../../../features/video/project/cursor-trajectory/project-window';
import type { VideoProject } from '../../../../features/video/project/types';

const logger = createLogger({ namespace: 'VideoEditorCursorTrajectory' });
type Request = { project: VideoProject; time: number };

/** One active read and one replaceable playhead request belong to this mounted preview. */
export function useCursorTrajectoryProject(
  project: VideoProject,
  time: number,
  createRenderer = createRecordingCursorTrajectoryRenderer
): VideoProject {
  const owner = useMemo(
    () => ({
      renderer: createRenderer(),
      active: false,
      epoch: 0,
      running: false,
      latest: { project: null as VideoProject | null, time: 0 },
      pending: null as Request | null,
      failedProject: null as VideoProject | null,
    }),
    [createRenderer]
  );
  const [completed, setCompleted] = useState<{
    source: VideoProject;
    project: VideoProject;
  } | null>(null);
  owner.latest = { project, time };
  useRecordingHistoryReadLifetime(owner);
  useEffect(() => {
    if (!project.cursorTrack?.sourceObservations?.some((group) => group.trajectory)) return;
    owner.pending = { project, time };
    runRecordingHistoryReads(owner, async (request, epoch) => {
      try {
        const prepared = await owner.renderer.prepare(request.project, request.time);
        if (
          owner.active &&
          owner.epoch === epoch &&
          owner.latest.project === request.project &&
          cursorTrajectoryProjectCoversTime(prepared, owner.latest.time)
        ) {
          owner.failedProject = null;
          setCompleted({ source: request.project, project: prepared });
        }
      } catch {
        if (owner.active && owner.epoch === epoch && owner.latest.project === request.project) {
          if (owner.failedProject !== request.project)
            logger.warn('Cursor trajectory preview is unavailable');
          owner.failedProject = request.project;
          setCompleted({ source: request.project, project: request.project });
        }
      }
    });
  }, [owner, project, time]);
  return completed?.source === project && cursorTrajectoryProjectCoversTime(completed.project, time)
    ? completed.project
    : project;
}
