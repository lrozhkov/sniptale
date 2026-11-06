import { cursorTrajectoryProjectCoversTime } from '../../../../features/video/project/cursor-trajectory/project-window';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import { projectMotionSourcePhases } from '../../../../features/video/project/motion/source-binding';
import { resolveMotionConnectionVideo } from '../../../../features/video/project/motion';
import { resolveMotionSourcePlayback } from '../../../../features/video/project/motion/source-playback';
import {
  resolveActiveMotionRegion,
  resolveConnectingMotionRegions,
} from '../../../../features/video/composition/motion/camera-interval';
import { isVideoProjectUtilityLaneVisible } from '../../../../features/video/project/utility-lanes';
import {
  VideoCursorCaptureMode,
  VideoMotionFocusMode,
  type VideoProject,
} from '../../../../features/video/project/types';

/** Checks archive coverage only for cursor facts consumed by this requested preview frame. */
export function canRenderPreparedCursorFrame(project: VideoProject, time: number): boolean {
  if (cursorTrajectoryProjectCoversTime(project, time)) return true;
  const covered = (source: VideoProject, at: number, clipId?: string) => {
    const groups = source.cursorTrack?.sourceObservations;
    const clips = source.clips.filter(
      (item) =>
        item.type === 'VIDEO' &&
        (!clipId || item.id === clipId) &&
        at >= item.startTime &&
        at < item.startTime + item.duration &&
        groups?.some(
          (group) => group.trajectory && group.sourceInstanceId === item.sourceInstanceId
        )
    );
    return cursorTrajectoryProjectCoversTime({ ...source, clips }, at);
  };
  if (
    project.cursorTrack?.captureMode === VideoCursorCaptureMode.SEPARATE &&
    !normalizeVideoProjectCursorSkin(project.cursorTrack.skin).hidden &&
    !covered(project, time)
  )
    return false;
  if (!isVideoProjectUtilityLaneVisible(project, 'camera')) return true;
  const playback = resolveMotionSourcePlayback(project, time);
  const cameraProject = projectMotionSourcePhases(playback?.geometryProject ?? project);
  const cameraTime = playback?.time ?? time;
  const active = resolveActiveMotionRegion(cameraProject, cameraTime);
  if (active)
    return (
      active.focusMode !== VideoMotionFocusMode.CURSOR ||
      covered(cameraProject, cameraTime, active.sourceBinding?.clipId)
    );
  const connection = resolveConnectingMotionRegions(cameraProject, cameraTime);
  if (!connection) return true;
  if (
    connection.source.focusMode !== VideoMotionFocusMode.CURSOR &&
    connection.destination.focusMode !== VideoMotionFocusMode.CURSOR
  )
    return true;
  const clip = resolveMotionConnectionVideo(
    cameraProject,
    connection.source,
    connection.destination,
    cameraTime
  );
  if (connection.destination.sourceBinding?.coordinateSpace === 'source-window' && !clip)
    return true;
  return covered(cameraProject, cameraTime, clip?.id);
}
