import {
  applyCameraFollowPreset,
  cameraFollowPreset,
  type CameraFollowSettings,
} from '../features/video/project/camera/cursor-policy';
import { translate } from '../platform/i18n';
import { SegmentedRow } from './compact-inspector-controls';

type CameraFollowSegmentProps = {
  settings: CameraFollowSettings;
  disabled?: boolean | undefined;
  showLabel?: boolean;
  onChange: (settings: CameraFollowSettings) => void;
};

/** Present camera zone choices while the host retains commit and numeric editing authority. */
export function CameraFollowZoneChoice(props: CameraFollowSegmentProps) {
  const label = translate('videoEditor.sidebar.cameraZoneSize');
  return (
    <SegmentedRow
      label={props.showLabel ? label : undefined}
      ariaLabel={label}
      value={String(props.settings.zoneSize)}
      options={[
        { value: '0.3', label: translate('videoEditor.sidebar.cameraZoneSmall') },
        { value: '0.55', label: translate('videoEditor.sidebar.cameraZoneMedium') },
        { value: '0.8', label: translate('videoEditor.sidebar.cameraZoneLarge') },
      ].map((option) => ({ ...option, disabled: props.disabled ?? false }))}
      onChange={(value) =>
        props.onChange({
          ...props.settings,
          zoneSize: value === '0.3' ? 0.3 : value === '0.55' ? 0.55 : 0.8,
        })
      }
    />
  );
}

/** Present the existing movement presets without owning the accepted camera settings. */
export function CameraFollowMovementChoice(props: CameraFollowSegmentProps) {
  const label = translate('videoEditor.sidebar.cameraMovement');
  return (
    <SegmentedRow
      label={props.showLabel ? label : undefined}
      ariaLabel={label}
      value={cameraFollowPreset(props.settings)}
      options={[
        { value: 'calm', label: translate('videoEditor.sidebar.cameraCalm') },
        { value: 'balanced', label: translate('videoEditor.sidebar.cameraBalanced') },
        { value: 'fast', label: translate('videoEditor.sidebar.cameraFast') },
      ].map((option) => ({ ...option, disabled: props.disabled ?? false }))}
      onChange={(preset) => {
        if (preset === 'calm' || preset === 'balanced' || preset === 'fast')
          props.onChange(applyCameraFollowPreset(props.settings, preset));
      }}
    />
  );
}
