import {
  createMotionPathAreaTarget,
  createMotionPathPointTarget,
  resolveMotionPathStopFocusArea,
  resolveMotionPathStopFocusPoint,
  resolveMotionPathStopScale,
} from '../../../../../../features/video/project/motion/path-targets';
import { VideoMotionPathTargetKind } from '../../../../../../features/video/project/types';
import type {
  VideoProjectMotionArea,
  VideoProjectMotionPathStop,
} from '../../../../../../features/video/project/types';
import {
  createDuplicatedMotionPathStop,
  insertMotionPathStop,
} from '../../../../../project/motion-path/edits';
import {
  removeMotionPathStop,
  updateMotionPathStop,
} from '../../../../../project/motion-path/core';
import { type MotionPathEditorProps, patchMotionPath } from './shared';

export function duplicateStop(
  props: MotionPathEditorProps & { index: number; stop: VideoProjectMotionPathStop }
) {
  const duplicatedStop = createDuplicatedMotionPathStop(
    props.panel.project,
    props.stop,
    props.stop.offset
  );
  const nextPath = insertMotionPathStop(props.path, duplicatedStop, props.index + 1);
  patchMotionPath(props.panel, props.motionRegion.id, nextPath);
}

export function removeStop(props: MotionPathEditorProps & { stop: VideoProjectMotionPathStop }) {
  patchMotionPath(
    props.panel,
    props.motionRegion.id,
    removeMotionPathStop(props.path, props.stop.id)
  );
}

export function updateTargetKind(
  props: MotionPathEditorProps & { stop: VideoProjectMotionPathStop },
  targetKind: VideoMotionPathTargetKind
) {
  const target =
    targetKind === VideoMotionPathTargetKind.AREA
      ? createMotionPathAreaTarget(
          props.panel.project,
          resolveMotionPathStopFocusArea(props.panel.project, props.stop)
        )
      : createMotionPathPointTarget(
          props.panel.project,
          resolveMotionPathStopFocusPoint(props.panel.project, props.stop),
          resolveMotionPathStopScale(props.panel.project, props.stop)
        );
  const nextPath = updateMotionPathStop(props.path, props.stop.id, (stop) => ({ ...stop, target }));

  patchMotionPath(props.panel, props.motionRegion.id, nextPath);
}

export function updatePointStop(
  props: MotionPathEditorProps & { stop: VideoProjectMotionPathStop },
  patch: Partial<{ scale: number; x: number; y: number }>
) {
  const nextPath = updateMotionPathStop(props.path, props.stop.id, (stop) => ({
    ...stop,
    target:
      stop.target.kind === VideoMotionPathTargetKind.POINT
        ? createMotionPathPointTarget(
            props.panel.project,
            { x: patch.x ?? stop.target.x, y: patch.y ?? stop.target.y },
            patch.scale ?? stop.target.scale
          )
        : stop.target,
  }));

  patchMotionPath(props.panel, props.motionRegion.id, nextPath);
}

export function updateAreaStop(
  props: MotionPathEditorProps & { stop: VideoProjectMotionPathStop },
  patch: Partial<VideoProjectMotionArea>
) {
  const nextPath = updateMotionPathStop(props.path, props.stop.id, (stop) => ({
    ...stop,
    target:
      stop.target.kind === VideoMotionPathTargetKind.AREA
        ? createMotionPathAreaTarget(props.panel.project, { ...stop.target, ...patch })
        : stop.target,
  }));

  patchMotionPath(props.panel, props.motionRegion.id, nextPath);
}
