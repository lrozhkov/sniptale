import { getVideoCompositionActionDuration } from '../../../../features/video/composition/timeline/frame/actions';
import type {
  VideoProject,
  VideoProjectActionEvent,
} from '../../../../features/video/project/types';
import { isVideoProjectUtilityLaneLocked } from '../../../../features/video/project/utility-lanes';
import { isSourceTimedClip } from '../../operations/source-timed-clips';

/** A ripple insert may not alter an affected locked action interval. */
export function areMaterialInsertActionsLocked(project: VideoProject, time: number): boolean {
  return (
    isVideoProjectUtilityLaneLocked(project, 'actions') &&
    project.actionEvents.some(
      (event) => event.time + getVideoCompositionActionDuration(event) > time
    )
  );
}

/** Preserves effect phases after source-bound points have been reconciled. */
export function insertMaterialActionGap(
  project: VideoProject,
  time: number,
  duration: number,
  trailingClipIdsBySourceId: ReadonlyMap<string, string>
): VideoProject {
  const trailingIds = new Map<string, string>();
  const actionEvents = project.actionEvents
    .flatMap((event) => {
      if (event.sourceAnchor) {
        const visibleDuration = getVideoCompositionActionDuration(event);
        if (event.time + visibleDuration <= time) return [event];
        const owner = project.clips.find(({ id }) => id === event.sourceAnchor?.sourceClipId);
        const trailingId = trailingClipIdsBySourceId.get(event.sourceAnchor.sourceClipId);
        const tail = project.clips.find(({ id }) => id === trailingId);
        const fragments: VideoProjectActionEvent[] = [];
        if (owner) {
          const retainedDuration = Math.min(
            visibleDuration,
            owner.startTime + owner.duration - event.time
          );
          if (retainedDuration > 0)
            fragments.push(
              retainedDuration === visibleDuration ? event : sliceAction(event, 0, retainedDuration)
            );
        }
        if (
          tail &&
          isSourceTimedClip(tail) &&
          event.time < time &&
          event.time + visibleDuration > time
        ) {
          const retainedDuration = Math.min(event.time + visibleDuration - time, tail.duration);
          const tailEventId = crypto.randomUUID();
          trailingIds.set(event.id, tailEventId);
          fragments.push({
            ...sliceAction(event, time - event.time, retainedDuration),
            id: tailEventId,
            time: time + duration,
            sourceAnchor: {
              ...event.sourceAnchor,
              sourceClipId: tail.id,
              sourceTime: tail.sourceStart,
            },
          });
        }
        return fragments;
      }
      const visibleDuration = getVideoCompositionActionDuration(event);
      if (event.time + visibleDuration <= time) return [event];
      if (event.time >= time)
        return [{ ...event, time: event.time + duration, timeBasis: 'project' as const }];
      const offset = time - event.time;
      const trailingId = crypto.randomUUID();
      trailingIds.set(event.id, trailingId);
      return [
        {
          ...sliceAction(event, 0, offset),
          timeBasis: 'project' as const,
        },
        {
          ...sliceAction(event, offset, visibleDuration - offset),
          id: trailingId,
          timeBasis: 'project' as const,
          time: time + duration,
        },
      ];
    })
    .sort((left, right) => left.time - right.time);
  return {
    ...project,
    actionEvents,
    ...(project.motionRegions
      ? {
          motionRegions: project.motionRegions.map((region) => {
            const target =
              region.targetActionEventId && trailingIds.get(region.targetActionEventId);
            return target && region.startTime >= time + duration
              ? { ...region, targetActionEventId: target }
              : region;
          }),
        }
      : {}),
  };
}

function sliceAction(
  event: VideoProjectActionEvent,
  offset: number,
  duration: number
): VideoProjectActionEvent {
  const visibleDuration = getVideoCompositionActionDuration(event);
  const animation = event.animation ?? {
    start: 0,
    end: visibleDuration,
    duration: visibleDuration,
  };
  const clockRate = (animation.end - animation.start) / visibleDuration;
  return {
    ...event,
    duration,
    animation: {
      ...animation,
      start: animation.start + offset * clockRate,
      end: Math.min(animation.end, animation.start + (offset + duration) * clockRate),
    },
  };
}
