import { Copy, Scissors, Trash2 } from 'lucide-react';

import type { ProjectTimelineToolbarProps } from '../../types';
import { ProjectTimelineToolbarActionButton } from './button';
import { getClipActionLabel, getClipActionTitle, getSplitActionTitle } from './labels';

function getActionDisabled(selectedClip: boolean) {
  return !selectedClip;
}

export function ProjectTimelineClipActions({
  canEditSelectedClip,
  canSplitSelectedClip,
  selectedClip,
  onDeleteSelectedClip,
  onDuplicateSelectedClip,
  onSplitSelectedClip,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'canEditSelectedClip'
  | 'canSplitSelectedClip'
  | 'selectedClip'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onSplitSelectedClip'
>) {
  const disabled = getActionDisabled(selectedClip) || !canEditSelectedClip;

  return (
    <>
      <ProjectTimelineToolbarActionButton
        disabled={!canSplitSelectedClip}
        icon={<Scissors size={14} strokeWidth={2} />}
        label={getClipActionLabel('split')}
        onClick={onSplitSelectedClip}
        title={getSplitActionTitle(canSplitSelectedClip, canEditSelectedClip)}
      />
      <ProjectTimelineToolbarActionButton
        disabled={disabled}
        icon={<Copy size={14} strokeWidth={2} />}
        label={getClipActionLabel('duplicate')}
        onClick={onDuplicateSelectedClip}
        title={getClipActionTitle('duplicate', disabled, canEditSelectedClip)}
      />
      <ProjectTimelineToolbarActionButton
        danger
        disabled={disabled}
        icon={<Trash2 size={14} strokeWidth={2} />}
        label={getClipActionLabel('delete')}
        onClick={onDeleteSelectedClip}
        title={getClipActionTitle('delete', disabled, canEditSelectedClip)}
      />
    </>
  );
}
