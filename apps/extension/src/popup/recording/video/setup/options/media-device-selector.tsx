import { InlineCurtainSelect } from '../../inline-controls/curtain-select';
import type { ReactNode } from 'react';

type VideoMediaDeviceOption = { deviceId: string; label: string };

export function VideoMediaDeviceSelector({
  ariaLabel,
  currentDeviceId,
  devices,
  emptyText,
  isLoading,
  label,
  loadingText,
  onDeviceChange,
  placeholder,
  secondaryAction,
  selectAriaLabel,
}: {
  ariaLabel: string;
  currentDeviceId: string | null;
  devices: VideoMediaDeviceOption[];
  emptyText: string;
  isLoading: boolean;
  label: string;
  loadingText: string;
  onDeviceChange: (deviceId: string | null) => void;
  placeholder: string;
  secondaryAction?: {
    ariaLabel: string;
    disabled?: boolean;
    label: string;
    panel: ReactNode;
    title?: string;
  };
  selectAriaLabel: string;
}) {
  const options = devices.map((device) => ({
    value: device.deviceId,
    label: device.label,
  }));
  const fallbackText = isLoading ? loadingText : options.length > 0 ? placeholder : emptyText;

  return (
    <InlineCurtainSelect
      ariaLabel={selectAriaLabel || ariaLabel}
      emptyText={fallbackText}
      label={label}
      onChange={(value) => onDeviceChange(value)}
      options={options}
      {...(secondaryAction === undefined ? {} : { secondaryAction })}
      value={currentDeviceId ?? ''}
    />
  );
}
