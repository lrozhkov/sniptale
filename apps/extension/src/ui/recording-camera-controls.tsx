import type { WebcamPresentationSettings } from '@sniptale/runtime-contracts/video/types/types';
import { WebcamPresentationShape } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_WEBCAM_APPEARANCE } from '../features/video/recording/webcam-presentation';
import { translate, type TranslationKey } from '../platform/i18n';
import { ColorField, NumericRow, SegmentedRow, ToggleField } from './compact-inspector-controls';
import { InspectorSurface } from './compact-inspector-controls/layout';

/** Shared page-camera controls. Callers retain accepted settings and persistence authority. */
export function RecordingCameraControls(props: {
  presentation: WebcamPresentationSettings;
  disabled?: boolean;
  onChange(patch: Partial<WebcamPresentationSettings>): void;
}) {
  const { presentation, onChange } = props;
  const disabled = props.disabled === true;
  const appearance = presentation.appearance ?? DEFAULT_WEBCAM_APPEARANCE;
  const updateAppearance = (patch: Partial<typeof appearance>) =>
    onChange({ appearance: { ...appearance, ...patch } });
  const numeric = (
    label: TranslationKey,
    value: number,
    min: number,
    max: number,
    change: (value: number) => void
  ) => (
    <NumericRow
      appearance="plain"
      label={translate(label)}
      value={value}
      min={min}
      max={max}
      step={1}
      precision={0}
      unit="%"
      disabled={disabled}
      onCommitValue={change}
      onPreviewValue={() => undefined}
      scrub={{ value, min, max, step: 1 }}
    />
  );
  return (
    <InspectorSurface
      className="grid min-w-0 grid-cols-1 gap-1 pr-4"
      data-ui="recording.camera.appearance"
    >
      <ToggleField
        label={translate('popup.video.webcamFreePlacement')}
        value={presentation.freePlacement === true}
        disabled={disabled}
        onChange={(freePlacement) => onChange({ freePlacement })}
      />
      <SegmentedRow
        label={translate('popup.video.webcamPresentationShapeLabel')}
        ariaLabel={translate('popup.video.webcamPresentationShapeLabel')}
        value={presentation.shape}
        options={[
          {
            value: WebcamPresentationShape.CIRCLE,
            label: translate('popup.video.webcamPresentationCircle'),
            disabled,
          },
          {
            value: WebcamPresentationShape.RECTANGLE,
            label: translate('popup.video.webcamPresentationRectangle'),
            disabled,
          },
          {
            value: WebcamPresentationShape.SOFT,
            label: translate('popup.video.webcamPresentationSoft'),
            disabled,
          },
          {
            value: WebcamPresentationShape.ELLIPSE,
            label: translate('popup.video.webcamPresentationEllipse'),
            disabled,
          },
        ]}
        onChange={(shape) => onChange({ shape })}
      />
      {presentation.shape === 'rectangle' || presentation.shape === 'soft'
        ? numeric(
            'popup.video.webcamPresentationRoundness',
            appearance.roundness,
            0,
            100,
            (roundness) => updateAppearance({ roundness })
          )
        : null}
      <ToggleField
        label={translate('popup.video.webcamPresentationMirror')}
        value={appearance.mirror}
        disabled={disabled}
        onChange={(mirror) => updateAppearance({ mirror })}
      />
      <ToggleField
        label={translate('popup.video.webcamPresentationShadow')}
        value={appearance.shadow}
        disabled={disabled}
        onChange={(shadow) => updateAppearance({ shadow })}
      />
      {appearance.shadow ? (
        <ColorField
          label={translate('popup.video.webcamPresentationShadowColor')}
          title={translate('popup.video.webcamPresentationShadowColor')}
          value={appearance.shadowColor}
          disabled={disabled}
          allowAlpha={false}
          allowTransparent={false}
          onChange={(shadowColor) => updateAppearance({ shadowColor })}
        />
      ) : null}
      {numeric(
        'popup.video.webcamPresentationSize',
        Math.round(presentation.sizeFraction * 100),
        12,
        55,
        (size) => onChange({ sizeFraction: size / 100 })
      )}
      {numeric(
        'popup.video.webcamPresentationZoom',
        Math.round(appearance.zoom * 100),
        100,
        400,
        (zoom) => updateAppearance({ zoom: zoom / 100 })
      )}
      {(['x', 'y'] as const).map((axis) => (
        <div key={axis}>
          {numeric(
            axis === 'x'
              ? 'popup.video.webcamPresentationCropHorizontal'
              : 'popup.video.webcamPresentationCropVertical',
            Math.round(presentation.cropOffset[axis] * 100),
            -100,
            100,
            (offset) =>
              onChange({ cropOffset: { ...presentation.cropOffset, [axis]: offset / 100 } })
          )}
        </div>
      ))}
    </InspectorSurface>
  );
}
