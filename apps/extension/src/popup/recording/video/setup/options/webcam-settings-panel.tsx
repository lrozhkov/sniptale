import { translate } from '../../../../../platform/i18n';
import {
  type VideoRecordingSettings,
  type WebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { resolveWebcamQualitySettings } from '@sniptale/runtime-contracts/video/types/webcam-quality';
import {
  WebcamQualityOptionGroup,
  formatActualSettings,
  useWebcamFrameRateOptions,
  useWebcamResolutionOptions,
} from './webcam-quality-controls';
import { WebcamPreview, useWebcamPreview } from './webcam-preview';

type WebcamSettingsPanelProps = {
  currentDeviceId: string | null;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  settings: VideoRecordingSettings;
};

export function WebcamSettingsPanel({
  currentDeviceId,
  onSettingsChange,
  settings,
}: WebcamSettingsPanelProps) {
  const quality = resolveWebcamQualitySettings(settings);
  const previewState = useWebcamPreview({ currentDeviceId, quality });
  const capabilities = previewState.status === 'ready' ? previewState.capabilities : null;
  const resolutionOptions = useWebcamResolutionOptions(capabilities);
  const frameRateOptions = useWebcamFrameRateOptions(capabilities);
  const updateQuality = (patch: Partial<WebcamQualitySettings>) => {
    onSettingsChange({ webcamQuality: { ...quality, ...patch } });
  };

  return (
    <div className="grid gap-3">
      <WebcamSettingsHeader />
      <WebcamPreview state={previewState} />
      <div className="text-[11px] font-medium text-[var(--sniptale-color-text-secondary)]">
        {formatActualSettings(previewState.settings)}
      </div>
      <WebcamQualityOptionGroup
        activeValue={quality.resolution}
        labelKey="popup.video.webcamQualityResolutionLabel"
        onChange={(resolution) => updateQuality({ resolution })}
        options={resolutionOptions}
      />
      <WebcamQualityOptionGroup
        activeValue={quality.frameRate}
        labelKey="popup.video.webcamQualityFrameRateLabel"
        onChange={(frameRate) => updateQuality({ frameRate })}
        options={frameRateOptions}
      />
    </div>
  );
}

function WebcamSettingsHeader() {
  return (
    <div>
      <div className="pr-8 text-xs font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('popup.video.webcamQualityTitle')}
      </div>
    </div>
  );
}
