import { translate } from '../../../../../platform/i18n/popup';
import {
  CaptureMode,
  type VideoRecordingSettings,
  type WebcamQualitySettings,
  WebcamPresentationMode,
  WebcamPresentationShape,
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
  const presentation = settings.webcamPresentation ?? DEFAULT_VIDEO_SETTINGS.webcamPresentation;
  const embeddedPresentationAvailable =
    captureMode === CaptureMode.TAB || captureMode === CaptureMode.TAB_CROP;

  const updatePresentation = (
    patch: Partial<NonNullable<VideoRecordingSettings['webcamPresentation']>>
  ) => {
    if (!presentation) {
      return;
    }
    onSettingsChange({ webcamPresentation: { ...presentation, ...patch } });
  };

  return (
    <div className="grid gap-3">
      <WebcamSettingsHeader />
      {embeddedPresentationAvailable && presentation ? (
        <WebcamPresentationControls presentation={presentation} onChange={updatePresentation} />
      ) : null}
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

function WebcamPresentationControls({
  presentation,
  onChange,
}: {
  presentation: NonNullable<VideoRecordingSettings['webcamPresentation']>;
  onChange: (patch: Partial<NonNullable<VideoRecordingSettings['webcamPresentation']>>) => void;
}) {
  return (
    <div className="grid gap-3 border-b border-[var(--sniptale-color-border-soft)] pb-3">
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
      {presentation.mode === WebcamPresentationMode.EMBEDDED ? (
        <>
          <WebcamQualityOptionGroup
            activeValue={presentation.shape}
            labelKey="popup.video.webcamPresentationShapeLabel"
            onChange={(shape) => onChange({ shape })}
            options={[
              {
                label: translate('popup.video.webcamPresentationCircle'),
                value: WebcamPresentationShape.CIRCLE,
              },
              {
                label: translate('popup.video.webcamPresentationRectangle'),
                value: WebcamPresentationShape.RECTANGLE,
              },
            ]}
          />
          <WebcamPresentationRange
            label={translate('popup.video.webcamPresentationSize')}
            min={12}
            max={55}
            value={Math.round(presentation.sizeFraction * 100)}
            onChange={(value) => onChange({ sizeFraction: value / 100 })}
          />
          <WebcamPresentationRange
            label={translate('popup.video.webcamPresentationCropHorizontal')}
            min={-100}
            max={100}
            value={Math.round(presentation.cropOffset.x * 100)}
            onChange={(value) =>
              onChange({ cropOffset: { ...presentation.cropOffset, x: value / 100 } })
            }
          />
          <WebcamPresentationRange
            label={translate('popup.video.webcamPresentationCropVertical')}
            min={-100}
            max={100}
            value={Math.round(presentation.cropOffset.y * 100)}
            onChange={(value) =>
              onChange({ cropOffset: { ...presentation.cropOffset, y: value / 100 } })
            }
          />
        </>
      ) : null}
    </div>
  );
}

function WebcamPresentationRange(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-medium text-[var(--sniptale-color-text-muted-strong)]">
        {props.label}
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </label>
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
