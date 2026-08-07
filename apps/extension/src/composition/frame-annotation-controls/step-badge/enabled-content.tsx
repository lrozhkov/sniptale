import type { ComponentProps } from 'react';

import { StepBadgePopoverContent } from './body';

export function StepBadgePopoverEnabledContent(
  props: ComponentProps<typeof StepBadgePopoverContent>
) {
  if (!props.localStepBadgeSettings.enabled) {
    return null;
  }

  return <StepBadgePopoverContent {...props} />;
}
