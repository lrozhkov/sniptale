import { translate } from '../../../../../platform/i18n/popup';
import {
  CaptureMode,
  type VideoRecordingSettings,
  type WebcamQualitySettings,
  WebcamPresentationMode,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { resolveWebcamQualitySettings } from '@sniptale/runtime-contracts/video/types/webcam-quality';
import {
  WebcamQualityOptionGroup,
  formatActualSettings,
  useWebcamFrameRateOptions,
  useWebcamResolutionOptions,
} from './webcam-quality-controls';
import { WebcamPreview, useWebcamPreview } from './webcam-preview';
import { RecordingCameraControls } from '../../../../../ui/recording-camera-controls';
import { useState } from 'react';
import type { WebcamPresentationSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  applyWebcamPresentationPatch,
  type WebcamPresentationPatch,
} from '../../../../../features/video/recording/webcam-presentation';

type WebcamSettingsPanelProps = {
  captureMode: CaptureMode;
  currentDeviceId: string | null;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  settings: VideoRecordingSettings;
};

export function WebcamSettingsPanel({
  captureMode,
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
  const acceptedPresentation =
    settings.webcamPresentation ?? DEFAULT_VIDEO_SETTINGS.webcamPresentation;
  const [preview, setPreview] = useState<WebcamPresentationSettings | null>(null);
  const presentation = preview ?? acceptedPresentation;
  const embeddedPresentationAvailable =
    captureMode === CaptureMode.TAB || captureMode === CaptureMode.TAB_CROP;

  const updatePresentation = (patch: WebcamPresentationPatch) => {
    if (!presentation) {
      return;
    }
    setPreview(null);
    onSettingsChange({
      webcamPresentation: applyWebcamPresentationPatch(acceptedPresentation!, patch),
    });
  };

  return (
    <div className="grid gap-2">
      {embeddedPresentationAvailable && presentation ? (
        <WebcamPlacementControl presentation={presentation} onChange={updatePresentation} />
      ) : null}
      <WebcamPreview
        presentation={embeddedPresentationAvailable ? (presentation ?? null) : null}
        state={previewState}
      />
      {embeddedPresentationAvailable && presentation?.mode === WebcamPresentationMode.EMBEDDED ? (
        <RecordingCameraControls
          presentation={presentation}
          onChange={updatePresentation}
          onPreview={(patch) => setPreview(applyWebcamPresentationPatch(presentation, patch))}
        />
      ) : null}
      <div className="text-[11px] font-normal text-[var(--sniptale-color-text-secondary)]">
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

function WebcamPlacementControl({
  presentation,
  onChange,
}: {
  presentation: NonNullable<VideoRecordingSettings['webcamPresentation']>;
  onChange: (patch: Partial<NonNullable<VideoRecordingSettings['webcamPresentation']>>) => void;
}) {
  return (
    <div>
      <WebcamQualityOptionGroup
        activeValue={presentation.mode}
        labelKey="popup.video.webcamPresentationModeLabel"
        onChange={(mode) => onChange({ mode })}
        options={[
          {
            label: translate('popup.video.webcamPresentationEmbedded'),
            value: WebcamPresentationMode.EMBEDDED,
          },
          {
            label: translate('popup.video.webcamPresentationSeparateTrack'),
            value: WebcamPresentationMode.SEPARATE_TRACK,
          },
        ]}
      />
    </div>
  );
}
