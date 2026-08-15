import { InlineCurtainSelect } from '../../../../../ui/popup-shell/inline-curtain/select';
import type { ReactNode } from 'react';

type VideoMediaDeviceOption = { deviceId: string; label: string };

export function VideoMediaDeviceSelector({
  ariaLabel,
  currentDeviceId,
  description,
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
  description: string;
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
    panelDescription: string;
    panelTitle: string;
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
      description={description}
      emptyText={fallbackText}
      label={label}
      onChange={(value) => onDeviceChange(value)}
      options={options}
      {...(secondaryAction === undefined ? {} : { secondaryAction })}
      value={currentDeviceId ?? ''}
    />
  );
}
