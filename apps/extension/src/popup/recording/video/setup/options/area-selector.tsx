import type { CapabilityState } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../platform/i18n/popup';
import { InlineCurtainSelect } from '../../../../../ui/popup-shell/inline-curtain/select';
import type { InlineCurtainOption } from '../../../../../ui/popup-shell/inline-curtain/options';

type RecordingAreaValue = 'full-tab' | 'manual-area';

function createRecordingAreaOptions(
  modeCapabilities: Record<CaptureMode, CapabilityState>
): InlineCurtainOption[] {
  const fullTab = modeCapabilities[CaptureMode.TAB];
  const manualArea = modeCapabilities[CaptureMode.TAB_CROP];

  return [
    {
      value: 'full-tab',
      label: translate('popup.video.recordingAreaFullTab'),
      description: translate('popup.video.recordingAreaFullTabDescription'),
      disabled: !fullTab.supported,
      ...(fullTab.reason ? { detail: fullTab.reason } : {}),
    },
    {
      value: 'manual-area',
      label: translate('popup.video.recordingAreaManual'),
      description: translate('popup.video.recordingAreaManualDescription'),
      disabled: !manualArea.supported,
      ...(manualArea.reason ? { detail: manualArea.reason } : {}),
    },
  ];
}

export function VideoRecordingAreaSelector(props: {
  captureMode: CaptureMode;
  modeCapabilities: Record<CaptureMode, CapabilityState>;
  onCaptureModeChange: (mode: CaptureMode) => void;
}) {
  const value: RecordingAreaValue =
    props.captureMode === CaptureMode.TAB_CROP ? 'manual-area' : 'full-tab';

  return (
    <InlineCurtainSelect
      value={value}
      label={translate('popup.video.recordingAreaLabel')}
      ariaLabel={translate('popup.video.recordingAreaAria')}
      description={translate('popup.video.recordingAreaDescription')}
      options={createRecordingAreaOptions(props.modeCapabilities)}
      onChange={(nextValue) => {
        props.onCaptureModeChange(
          nextValue === 'manual-area' ? CaptureMode.TAB_CROP : CaptureMode.TAB
        );
      }}
    />
  );
}
