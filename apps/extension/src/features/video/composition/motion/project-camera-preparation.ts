import type { VideoProject, VideoProjectMotionRegion } from '../../project/types';
import { VideoMotionFocusMode } from '../../project/types';
import type { CameraOutputViewport } from '../../project/export/output-dimensions';
import { projectMotionSourcePhases } from '../../project/motion/source-binding';
import { resolveMotionSourcePlayback } from '../../project/motion/source-playback';
import { isCameraMotionRegion } from '../../project/motion/normalization';
import { isVideoProjectUtilityLaneVisible } from '../../project/utility-lanes';
import { resolveProjectCursorOrientation } from './cursor-orientation';
import { snapshotProjectCameraPlan, resolveProjectCameraConflicts } from './project-follow';
import {
  projectCameraGeometryKey,
  projectCameraInputSignature,
  projectCameraOutputKey,
  freezePreparedProjectCamera,
  withoutPreparedProjectCamera,
  type PreparedProjectCamera,
} from './prepared-project-camera';

/** Compile existing admission algorithms while scratch facts are available, then retain only values. */
export function compileProjectCameraBundle(
  project: VideoProject,
  output?: CameraOutputViewport
): PreparedProjectCamera {
  project = withoutPreparedProjectCamera(project);
  const cameras: PreparedProjectCamera['cameras'][number][] = [];
  const orientations: PreparedProjectCamera['orientations'][number][] = [];
  const collect = (view: VideoProject, candidate: VideoProjectMotionRegion) => {
    if (candidate.duration <= 0 || candidate.sourceBinding?.dormant) return;
    const authoredKey = projectCameraGeometryKey(view, candidate);
    if (!orientations.some((item) => item.key === authoredKey))
      orientations.push({
        key: authoredKey,
        plan: resolveProjectCursorOrientation(view, candidate),
      });
    view = projectMotionSourcePhases(view);
    const region = view.motionRegions?.find((item) => item.id === candidate.id) ?? candidate;
    if (region.duration <= 0 || region.sourceBinding?.dormant) return;
    const key = projectCameraGeometryKey(view, region);
    if (!orientations.some((item) => item.key === key))
      orientations.push({ key, plan: resolveProjectCursorOrientation(view, region) });
    if (
      region.focusMode !== VideoMotionFocusMode.CURSOR ||
      cameras.some((item) => item.key === key)
    )
      return;
    cameras.push(snapshotProjectCameraPlan(view, region, output));
  };
  if (isVideoProjectUtilityLaneVisible(project, 'camera')) {
    for (const region of (project.motionRegions ?? []).filter(isCameraMotionRegion)) {
      collect(project, region);
      const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
      if (!clip) continue;
      const playback = resolveMotionSourcePlayback(project, clip.startTime, clip.id);
      if (playback)
        for (const sourceRegion of (playback.geometryProject.motionRegions ?? []).filter(
          isCameraMotionRegion
        ))
          collect(playback.geometryProject, sourceRegion);
    }
  }
  return freezePreparedProjectCamera({
    signature: projectCameraInputSignature(project),
    output: projectCameraOutputKey(project, output),
    cameras,
    orientations,
    conflicts: resolveProjectCameraConflicts(project, output),
  });
}
