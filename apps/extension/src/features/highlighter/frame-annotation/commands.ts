import type { EffectMode } from '@sniptale/ui/highlighter-style/types';
import { translate } from '../../../platform/i18n';

export type FrameAnnotationCommandId =
  | `effect-${EffectMode}`
  | 'step-badge'
  | 'callout'
  | 'decrease'
  | 'increase'
  | 'edit'
  | 'delete'
  | 'close';

interface FrameAnnotationCommand {
  id: FrameAnnotationCommandId;
  label: string;
}

export function getFrameAnnotationCommandSchema(): FrameAnnotationCommand[] {
  return [
    { id: 'effect-border', label: translate('content.interactiveFrame.effectBorder') },
    { id: 'effect-blur', label: translate('content.interactiveFrame.effectBlur') },
    { id: 'effect-focus', label: translate('content.interactiveFrame.effectFocus') },
    { id: 'step-badge', label: translate('content.interactiveFrame.stepBadgeEnable') },
    { id: 'callout', label: translate('content.interactiveFrame.calloutAdd') },
    { id: 'decrease', label: translate('content.interactiveFrame.decreaseFrame') },
    { id: 'increase', label: translate('content.interactiveFrame.increaseFrame') },
    { id: 'edit', label: translate('content.interactiveFrame.editButton') },
    { id: 'delete', label: translate('content.interactiveFrame.deleteButton') },
    { id: 'close', label: translate('content.interactiveFrame.closeToolbar') },
  ];
}
