import React from 'react';
import { translate } from '../../../platform/i18n';
import { getControlPrimaryButtonClassName } from '@sniptale/ui/control-language';
import { SizeControlsHeader, SizeControlsRow } from '../size-controls';

const primaryPanelButtonClassName = [
  getControlPrimaryButtonClassName(),
  'w-full',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

export const EditorInspectorSizePanel: React.FC<{
  label: string;
  valueText: string;
  width: number;
  height: number;
  locked: boolean;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onToggleLock: () => void;
  onApply: () => void;
}> = ({
  label,
  valueText,
  width,
  height,
  locked,
  onWidthChange,
  onHeightChange,
  onToggleLock,
  onApply,
}) => (
  <div className="space-y-3">
    <SizeControlsHeader label={label} valueText={valueText} />
    <SizeControlsRow
      width={width}
      height={height}
      locked={locked}
      onWidthChange={onWidthChange}
      onHeightChange={onHeightChange}
      onToggleLock={onToggleLock}
      dataSizePanelDimensions
    />
    <button type="button" className={primaryPanelButtonClassName} onClick={onApply}>
      {translate('editor.compact.apply')}
    </button>
  </div>
);
