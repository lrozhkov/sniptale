import type { VideoProjectAnnotationClip } from '../../../../../../features/video/project/types';
import type { WorkspaceSidebarProps } from '../../../contracts/props';

export interface AnnotationTargetControlsProps {
  clip: VideoProjectAnnotationClip;
  disabled: boolean;
  onUpdateAnnotationClipTemplate: NonNullable<
    WorkspaceSidebarProps['onUpdateAnnotationClipTemplate']
  >;
}
