import { useEffect, useMemo, useState } from 'react';
import {
  useRecordingHistoryReadLifetime,
  runRecordingHistoryReads,
} from '../../../runtime/recording-history-reader';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createRecordingCursorTrajectoryRenderer } from '../../../../workflows/video-review/cursor-trajectory';
import { cursorTrajectoryProjectCoversTime } from '../../../../features/video/project/cursor-trajectory/project-window';
import { canRenderPreparedCursorFrame } from './cursor-readiness';
import type { VideoProject } from '../../../../features/video/project/types';

const logger = createLogger({ namespace: 'VideoEditorCursorTrajectory' });
type Request = { project: VideoProject; time: number };

/** One active read and one replaceable playhead request belong to this mounted preview. */
export function useCursorTrajectoryProject(
  project: VideoProject,
  time: number,
  createRenderer = createRecordingCursorTrajectoryRenderer
): { project: VideoProject; canRender: (time: number) => boolean } {
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
    unavailable: boolean;
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
          (cursorTrajectoryProjectCoversTime(prepared, owner.latest.time) ||
            !cursorTrajectoryProjectCoversTime(prepared, request.time))
        ) {
          owner.failedProject = null;
          const unavailable = !cursorTrajectoryProjectCoversTime(prepared, request.time);
          setCompleted((previous) =>
            previous?.source === request.project &&
            previous.project === prepared &&
            previous.unavailable === unavailable
              ? previous
              : {
                  source: request.project,
                  project: prepared,
                  unavailable,
                }
          );
        }
      } catch {
        if (owner.active && owner.epoch === epoch && owner.latest.project === request.project) {
          if (owner.failedProject !== request.project)
            logger.warn('Cursor trajectory preview is unavailable');
          owner.failedProject = request.project;
          setCompleted((previous) =>
            previous?.source === request.project && previous.unavailable
              ? previous
              : {
                  source: request.project,
                  project: request.project,
                  unavailable: true,
                }
          );
        }
      }
    });
  }, [owner, project, time]);
  const current = completed?.source === project ? completed : null;
  const prepared = current?.project ?? project;
  const unavailable = current?.unavailable === true;
  return useMemo(
    () => ({
      project: prepared,
      canRender: (at: number) => unavailable || canRenderPreparedCursorFrame(prepared, at),
    }),
    [prepared, unavailable]
  );
}
