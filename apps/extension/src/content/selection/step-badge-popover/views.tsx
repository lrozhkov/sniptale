import type { ComponentProps } from 'react';
import { StepBadgeValueSection as SharedStepBadgeValueSection } from '../../../composition/frame-annotation-controls/step-badge/views';
import { dispatchStepBadgeReorder } from '../../platform/page-context/frame-events';

export {
  StepBadgeAutoSection,
  StepBadgePositionSection,
} from '../../../composition/frame-annotation-controls/step-badge/views';

export function StepBadgeValueSection(props: ComponentProps<typeof SharedStepBadgeValueSection>) {
  return (
    <SharedStepBadgeValueSection
      {...props}
      onReorder={(direction, frameId) => dispatchStepBadgeReorder({ direction, frameId })}
    />
  );
}
