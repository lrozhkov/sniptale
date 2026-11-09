import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useRecordingHistoryReadLifetime,
  runRecordingHistoryReads,
} from '../../../runtime/recording-history-reader';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createRecordingCursorTrajectoryRenderer } from '../../../../workflows/video-review/cursor-trajectory';
import { cursorTrajectoryProjectCoversTime } from '../../../../features/video/project/cursor-trajectory/project-window';
import { hasCursorFollowingCameraAt } from '../../../../features/video/composition/motion/camera-interval';
import { canRenderPreparedCursorFrame } from './cursor-readiness';
import { VideoMotionFocusMode, type VideoProject } from '../../../../features/video/project/types';
import { isCameraMotionRegion } from '../../../../features/video/project/motion/normalization';

import {
  attachPreparedProjectCamera,
  withoutPreparedProjectCamera,
  preparedProjectCamera,
  projectRequiresPreparedCamera,
} from '../../../../features/video/composition/motion/prepared-project-camera';
import type { PreviewEffectRuntimeFeedback } from '../types';

const logger = createLogger({ namespace: 'VideoEditorCursorTrajectory' });
type Request = { project: VideoProject; time: number };

/** One active read and one replaceable playhead request belong to this mounted preview. */
export function useCursorTrajectoryProject(
  project: VideoProject,
  time: number,
  createRenderer = createRecordingCursorTrajectoryRenderer,
  feedback?: Pick<PreviewEffectRuntimeFeedback, 'onFailure' | 'onRecovery' | 'retryVersion'>
): {
  project: VideoProject;
  canRender: (time: number) => boolean;
  cameraFailed: boolean;
  retryCamera: () => void;
} {
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
  const [camera, setCamera] = useState<{
    source: VideoProject;
    project: VideoProject | null;
    failed: boolean;
    retry: number;
    feedbackRetry: number;
    error?: unknown;
  } | null>(null);
  const [cameraRetry, setCameraRetry] = useState(0);
  const retryCamera = useCallback(() => setCameraRetry((value) => value + 1), []);
  const retryVersion = feedback?.retryVersion ?? 0;
  const onFailure = feedback?.onFailure;
  const onRecovery = feedback?.onRecovery;
  useEffect(() => {
    const controller = new AbortController();
    setCamera(null);
    void owner.renderer
      .prepareCamera(project, undefined, controller.signal)
      .then((prepared) => {
        if (controller.signal.aborted) return;
        if (projectRequiresPreparedCamera(project) && !preparedProjectCamera(prepared))
          throw new Error('Prepared camera is unavailable.');
        setCamera({
          source: project,
          project: prepared,
          failed: false,
          retry: cameraRetry,
          feedbackRetry: retryVersion,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCamera({
          source: project,
          project: null,
          failed: true,
          error,
          retry: cameraRetry,
          feedbackRetry: retryVersion,
        });
      });
    return () => controller.abort();
  }, [owner, project, cameraRetry, retryVersion]);
  const currentCamera =
    camera?.source === project &&
    camera.retry === cameraRetry &&
    camera.feedbackRetry === retryVersion
      ? camera
      : null;
  useEffect(() => {
    if (currentCamera?.failed && hasCursorFollowingCameraAt(project, time))
      onFailure?.('camera-history', currentCamera.error);
    else onRecovery?.('camera-history');
  }, [currentCamera, project, time, onFailure, onRecovery]);
  const [completed, setCompleted] = useState<{
    source: VideoProject;
    project: VideoProject;
    unavailable: boolean;
    readFailed: boolean;
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
            previous.unavailable === unavailable &&
            !previous.readFailed
              ? previous
              : {
                  source: request.project,
                  project: prepared,
                  unavailable,
                  readFailed: false,
                }
          );
        }
      } catch {
        if (owner.active && owner.epoch === epoch && owner.latest.project === request.project) {
          if (owner.failedProject !== request.project)
            logger.warn('Cursor trajectory preview is unavailable');
          owner.failedProject = request.project;
          setCompleted((previous) =>
            previous?.source === request.project && previous.unavailable && previous.readFailed
              ? previous
              : {
                  source: request.project,
                  project: request.project,
                  unavailable: true,
                  readFailed: true,
                }
          );
        }
      }
    });
  }, [owner, project, time]);
  const current = completed?.source === project ? completed : null;
  const frameProject = current?.project ?? project;
  const cameraFailed = currentCamera?.failed === true && hasCursorFollowingCameraAt(project, time);
  const manualFallback = cameraFailed && current?.unavailable === true && !current.readFailed;
  const cameraProject = currentCamera?.project;
  const bundle = cameraProject && preparedProjectCamera(cameraProject);
  const prepared = useMemo(
    () =>
      manualFallback
        ? withoutPreparedProjectCamera({
            ...frameProject,
            motionRegions: (frameProject.motionRegions ?? []).map((region) =>
              isCameraMotionRegion(region) && region.focusMode === VideoMotionFocusMode.CURSOR
                ? { ...region, focusMode: VideoMotionFocusMode.MANUAL }
                : region
            ),
          })
        : bundle && preparedProjectCamera(frameProject) !== bundle
          ? attachPreparedProjectCamera(frameProject, bundle)
          : frameProject,
    [frameProject, bundle, manualFallback]
  );
  const unavailable = current?.unavailable === true;
  return useMemo(
    () => ({
      project: prepared,
      canRender: (at: number) => canRenderPreparedCursorFrame(prepared, at, unavailable),
      cameraFailed,
      retryCamera,
    }),
    [prepared, unavailable, cameraFailed, retryCamera]
  );
}
