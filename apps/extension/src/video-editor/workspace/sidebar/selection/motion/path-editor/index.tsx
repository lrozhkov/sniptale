import type { VideoProjectMotionRegion } from '../../../../../../features/video/project/types';
import { resolveMotionPath } from '../../../../../project/motion-path/core';
import type { WorkspaceSidebarSelectionPanelProps } from '../../../contracts/selection-panel';
import { MotionPathActions, MotionPathTimeline } from './actions';
import { MotionPathSegmentSection } from './segments';
import { MotionPathStopSection } from './stops';

export function MotionPathEditor(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  const path = resolveMotionPath(props.panel.project, props.motionRegion);

  return (
    <div className="space-y-3">
      <MotionPathActions motionRegion={props.motionRegion} panel={props.panel} path={path} />
      <MotionPathTimeline path={path} />
      <div className="space-y-3">
        {path.stops.map((stop, index) => (
          <MotionPathStopSection
            key={stop.id}
            index={index}
            motionRegion={props.motionRegion}
            panel={props.panel}
            path={path}
            stop={stop}
          />
        ))}
      </div>
      <div className="space-y-3">
        {path.segments.map((segment, index) => (
          <MotionPathSegmentSection
            key={`${path.stops[index]?.id ?? index}-${path.stops[index + 1]?.id ?? index}`}
            fromIndex={index}
            motionRegion={props.motionRegion}
            panel={props.panel}
            path={path}
            segment={segment}
          />
        ))}
      </div>
    </div>
  );
}
