import type { ProjectTimelineToolbarProps } from '../types';
import { ProjectTimelineAddControls } from './add-controls';
import { ProjectTimelineClipActions } from './clip-actions';

export function ProjectTimelineToolbarLeadingControls({
  canAddMotionRegion,
  canDeleteSelectedClip,
  canEditSelectedClip,
  canSplitSelectedClip,
  insertion,
  selectedClip,
  onDeleteSelectedClip,
  onDuplicateSelectedClip,
  onSplitSelectedClip,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'canAddMotionRegion'
  | 'canDeleteSelectedClip'
  | 'canEditSelectedClip'
  | 'canSplitSelectedClip'
  | 'insertion'
  | 'selectedClip'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onSplitSelectedClip'
>) {
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1">
      <ProjectTimelineAddControls insertion={insertion} canAddMotionRegion={canAddMotionRegion} />
      <div
        className={[
          'flex shrink-0 items-center gap-[var(--timeline-control-gap)] border-l',
          'border-[color:var(--sniptale-color-border-soft)] pl-1',
        ].join(' ')}
      >
        <ProjectTimelineClipActions
          canDeleteSelectedClip={canDeleteSelectedClip}
          canEditSelectedClip={canEditSelectedClip}
          canSplitSelectedClip={canSplitSelectedClip}
          selectedClip={selectedClip}
          onDeleteSelectedClip={onDeleteSelectedClip}
          onDuplicateSelectedClip={onDuplicateSelectedClip}
          onSplitSelectedClip={onSplitSelectedClip}
        />
      </div>
    </div>
  );
}
