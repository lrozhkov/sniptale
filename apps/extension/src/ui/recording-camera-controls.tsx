import type { WebcamPresentationSettings } from '@sniptale/runtime-contracts/video/types/types';
import { WebcamPresentationShape } from '@sniptale/runtime-contracts/video/types/types';
import {
  DEFAULT_WEBCAM_APPEARANCE,
  type WebcamPresentationPatch,
} from '../features/video/recording/webcam-presentation';
import { translate, type TranslationKey } from '../platform/i18n';
import { ColorField, NumericRow, SegmentedRow, ToggleField } from './compact-inspector-controls';
import { InspectorSurface } from './compact-inspector-controls/layout';

const CAMERA_SHAPES = [
  [WebcamPresentationShape.CIRCLE, 'popup.video.webcamPresentationCircle'],
  [WebcamPresentationShape.RECTANGLE, 'popup.video.webcamPresentationRectangle'],
  [WebcamPresentationShape.SOFT, 'popup.video.webcamPresentationSoft'],
  [WebcamPresentationShape.ELLIPSE, 'popup.video.webcamPresentationEllipse'],
  [WebcamPresentationShape.SQUARE, 'popup.video.webcamPresentationSquare'],
] as const;

/** Shared page-camera controls. Callers retain accepted settings and persistence authority. */
export function RecordingCameraControls(props: {
  presentation: WebcamPresentationSettings;
  disabled?: boolean;
  onChange(patch: WebcamPresentationPatch): void;
  onPreview?(patch: WebcamPresentationPatch): void;
}) {
  const { presentation, onChange } = props;
  const disabled = props.disabled === true;
  const appearance = presentation.appearance ?? DEFAULT_WEBCAM_APPEARANCE;
  const update = (patch: WebcamPresentationPatch, preview = false) =>
    preview ? props.onPreview?.(patch) : onChange(patch);
  const updateAppearance = (patch: Partial<typeof appearance>, preview = false) =>
    update({ appearance: patch }, preview);
  const numeric = (
    label: TranslationKey,
    value: number,
    min: number,
    max: number,
    change: (value: number, preview: boolean) => void,
    unit: '%' | 'px' = '%'
  ) => (
    <NumericRow
      appearance="plain"
      label={translate(label)}
      value={value}
      min={min}
      max={max}
      step={1}
      precision={0}
      unit={unit}
      disabled={disabled}
      onCommitValue={(value) => change(value, false)}
      onPreviewValue={(value) => change(value, true)}
      scrub={{ value, min, max, step: 1 }}
    />
  );
  return (
    <InspectorSurface
      className="grid min-w-0 grid-cols-1 gap-1 px-1"
      data-ui="recording.camera.appearance"
      tabIndex={-1}
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
        options={CAMERA_SHAPES.map(([value, label]) => ({
          value,
          label: translate(label),
          icon: <CameraShapeIcon shape={value} />,
          disabled,
        }))}
        onChange={(shape) => onChange({ shape })}
      />
      {presentation.shape === 'rectangle' ||
      presentation.shape === 'soft' ||
      presentation.shape === 'square'
        ? numeric(
            'popup.video.webcamPresentationRoundness',
            appearance.roundness,
            0,
            100,
            (roundness, preview) => updateAppearance({ roundness }, preview),
            presentation.shape === 'soft' ? '%' : 'px'
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
          triggerVariant="swatch"
          floatingPlacement="auto"
          onChange={(shadowColor) => updateAppearance({ shadowColor })}
        />
      ) : null}
      {numeric(
        'popup.video.webcamPresentationSize',
        Math.round(presentation.sizeFraction * 100),
        12,
        55,
        (size, preview) => update({ sizeFraction: size / 100 }, preview)
      )}
      {numeric(
        'popup.video.webcamPresentationZoom',
        Math.round(appearance.zoom * 100),
        100,
        400,
        (zoom, preview) => updateAppearance({ zoom: zoom / 100 }, preview)
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
            (offset, preview) => update({ cropOffset: { [axis]: offset / 100 } }, preview)
          )}
        </div>
      ))}
    </InspectorSurface>
  );
}

function CameraShapeIcon({ shape }: { shape: WebcamPresentationSettings['shape'] }) {
  const square = shape === 'square';
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      {shape === 'circle' ? (
        <circle cx="12" cy="12" r="8" />
      ) : shape === 'ellipse' ? (
        <ellipse cx="12" cy="12" rx="10" ry="7" />
      ) : (
        <rect
          x={square ? 4 : 2}
          y={square ? 4 : 5}
          width={square ? 16 : 20}
          height={square ? 16 : 14}
          rx={shape === 'soft' ? 6 : 2}
        />
      )}
    </svg>
  );
}
