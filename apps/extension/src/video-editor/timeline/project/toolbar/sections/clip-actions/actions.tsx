import { translate } from '../../../../../../platform/i18n';
import { Copy, Scissors, Trash2 } from 'lucide-react';

import type { ProjectTimelineToolbarProps } from '../../types';
import { ProjectTimelineToolbarActionButton } from './button';
import { getClipActionLabel, getClipActionTitle, getSplitActionTitle } from './labels';

export function ProjectTimelineClipActions({
  canDuplicateSelection,
  canDeleteSelectedClip,
  canEditSelectedClip,
  canSplitSelectedClip,
  selectedClip,
  onDeleteSelectedClip,
  onDuplicateSelectedClip,
  onSplitSelectedClip,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'canDuplicateSelection'
  | 'canDeleteSelectedClip'
  | 'canEditSelectedClip'
  | 'canSplitSelectedClip'
  | 'selectedClip'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onSplitSelectedClip'
>) {
  const disabled = !canDuplicateSelection;

  return (
    <>
      <ProjectTimelineToolbarActionButton
        disabled={!canSplitSelectedClip}
        icon={<Scissors size={14} strokeWidth={2} />}
        label={getClipActionLabel('split')}
        onClick={onSplitSelectedClip}
        title={
          selectedClip
            ? getSplitActionTitle(canSplitSelectedClip, canEditSelectedClip)
            : translate('videoEditor.timeline.splitUnavailableTitle')
        }
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
        disabled={!canDeleteSelectedClip}
        icon={<Trash2 size={14} strokeWidth={2} />}
        label={getClipActionLabel('delete')}
        onClick={onDeleteSelectedClip}
        title={getClipActionTitle('delete', !canDeleteSelectedClip, canDeleteSelectedClip)}
      />
    </>
  );
}
