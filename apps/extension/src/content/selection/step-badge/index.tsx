import React from 'react';
import { translate } from '../../../platform/i18n';
import type { StepBadgeSettings } from '../../../features/highlighter/contracts';
import { getStepBadgeStyle, StepBadgeValue } from './views';

interface StepBadgeProps {
  settings: StepBadgeSettings;
  borderColor: string;
  borderWidth: number;
  shadow?: number;
  zIndex: number;
  onClick?: () => void;
}

export const StepBadge: React.FC<StepBadgeProps> = ({
  settings,
  borderColor,
  borderWidth,
  shadow,
  zIndex,
  onClick,
}) => {
  if (!settings.enabled || !settings.value) {
    return null;
  }

  const tooltip = `${translate('content.stepBadge.tooltipPrefix')} ${settings.value}`;
  const shadowProps = shadow === undefined ? {} : { shadow };

  return (
    <div
      className="sniptale-step-badge"
      onClick={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        onClick?.();
      }}
      style={getStepBadgeStyle({
        settings,
        borderColor,
        borderWidth,
        zIndex,
        clickable: Boolean(onClick),
        ...shadowProps,
      })}
      title={tooltip}
    >
      <StepBadgeValue value={settings.value} />
    </div>
  );
};
