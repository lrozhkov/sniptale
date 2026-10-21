import { getMediaClipSourceTime } from '../../../../../features/video/project/timeline/rate';
import { useContext } from 'react';
import { Scan, RotateCcw } from 'lucide-react';
import { InspectorActionButton } from '../shared/actions';
import {
  activeCameraPosition,
  type CameraPositionEdit,
} from '../../../../../features/video/project/camera/animation';
import {
  DEFAULT_CAMERA_APPEARANCE,
  type CameraAppearance,
  type CameraCrop,
} from '../../../../../features/video/project/camera/appearance';
import { InspectorDetails } from '../shared/details';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import type { VideoProjectVideoClip } from '../../../../../features/video/project/types';
import { RuntimePreviewContext } from '../../../../runtime/controller/composition/contexts';
import { translate } from '../../../../../platform/i18n';
import { OptionButtonsField } from '../shared/option-buttons';
import { SliderField } from '../shared/sliders';
import { CameraCropPreview } from './camera-crop-preview';

export function CameraAppearanceControls(props: {
  clip: VideoProjectVideoClip;
  project: WorkspaceSidebarSelectionPanelProps['project'];
  onUpdateClipTransform?: WorkspaceSidebarSelectionPanelProps['onUpdateClipTransform'];
  currentTime: number;
  disabled: boolean;
  onEdit?: (clipId: string, edit: CameraPositionEdit) => void;
}) {
  const runtime = useContext(RuntimePreviewContext);
  const base = props.clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE;
  const position = activeCameraPosition(props.clip, props.currentTime);
  const value = base;
  const transform = position?.transform ?? props.clip.transform;
  const diameter = Math.min(transform.width, transform.height);
  const maximumDiameter = Math.max(
    1,
    (7680 * diameter) / Math.max(transform.width, transform.height)
  );
  const disabled = props.disabled || !props.onEdit;
  const change = (appearance: CameraAppearance) =>
    props.onEdit?.(props.clip.id, { kind: 'appearance', appearance });
  return (
    <div className="sniptale-parameter-stack space-y-2" data-ui="video-editor.camera-appearance">
      <OptionButtonsField
        label={translate('gallery.videoReview.webcamMirror')}
        value={props.clip.cameraMirrored ? 'horizontal' : 'off'}
        disabled={disabled}
        options={[
          { value: 'off', label: translate('gallery.videoReview.webcamMirrorOff') },
          { value: 'horizontal', label: translate('gallery.videoReview.webcamMirrorOn') },
        ]}
        onChange={(value) =>
          props.onEdit?.(props.clip.id, {
            kind: 'mirror',
            mirrored: value === 'horizontal',
          })
        }
      />
      <OptionButtonsField
        label={translate('videoEditor.sidebar.cameraShape')}
        value={value.shape}
        disabled={disabled}
        options={[
          { value: 'rounded', label: translate('videoEditor.sidebar.cameraShapeRounded') },
          { value: 'soft', label: translate('videoEditor.sidebar.cameraShapeSoft') },
          { value: 'ellipse', label: translate('videoEditor.sidebar.cameraShapeEllipse') },
          { value: 'circle', label: translate('gallery.videoReview.webcamCircle') },
        ]}
        onChange={(shape) => change({ ...base, shape })}
      />
      {value.shape === 'circle' ? (
        <SliderField
          label={translate('gallery.videoReview.webcamDiameter')}
          value={diameter}
          min={Math.min(40, maximumDiameter)}
          max={maximumDiameter}
          scrubMax={Math.max(
            Math.min(40, maximumDiameter),
            Math.min(maximumDiameter, props.project.width, props.project.height)
          )}
          step={1}
          disabled={props.disabled || !props.onUpdateClipTransform}
          formatValue={(v) => `${Math.round(v)}px`}
          onChange={(size) => {
            const scale = size / diameter;
            props.onUpdateClipTransform?.(props.clip.id, {
              width: transform.width * scale,
              height: transform.height * scale,
            });
          }}
        />
      ) : (
        (['width', 'height'] as const).map((field) => (
          <SliderField
            key={field}
            label={translate(
              field === 'width'
                ? 'videoEditor.sidebar.widthLabel'
                : 'videoEditor.sidebar.heightLabel'
            )}
            value={transform[field]}
            min={40}
            max={7680}
            scrubValue={transform[field]}
            scrubMin={40}
            scrubMax={Math.max(40, props.project[field])}
            step={1}
            disabled={props.disabled || !props.onUpdateClipTransform}
            formatValue={(v) => `${Math.round(v)}px`}
            onChange={(size) => props.onUpdateClipTransform?.(props.clip.id, { [field]: size })}
          />
        ))
      )}
      {value.shape !== 'ellipse' && value.shape !== 'circle' ? (
        <SliderField
          label={translate('videoEditor.sidebar.cameraRoundness')}
          min={0}
          max={100}
          step={1}
          value={value.roundness}
          disabled={disabled}
          formatValue={(v) => `${Math.round(v)}%`}
          onChange={(roundness) => change({ ...base, roundness })}
        />
      ) : null}
      {renderCameraCropControls({
        clip: props.clip,
        currentTime: props.currentTime,
        disabled,
        onEdit: props.onEdit,
        url: runtime?.assetUrls[props.clip.assetId],
      })}
    </div>
  );
}

function renderCameraCropControls(props: {
  clip: VideoProjectVideoClip;
  currentTime: number;
  disabled: boolean;
  onEdit: ((clipId: string, edit: CameraPositionEdit) => void) | undefined;
  url: string | undefined;
}) {
  const base = props.clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE;
  const position = activeCameraPosition(props.clip, props.currentTime);
  const crop = position?.crop ?? base;
  const value = { ...base, zoom: crop.zoom, panX: crop.panX, panY: crop.panY };
  const transform = position?.transform ?? props.clip.transform;
  const disabled = props.disabled;
  const changeCrop = (crop: CameraCrop) =>
    props.onEdit?.(props.clip.id, {
      kind: 'crop',
      crop: { zoom: crop.zoom, panX: crop.panX, panY: crop.panY },
    });
  return (
    <InspectorDetails
      preferenceId="camera-appearance:videoEditor.sidebar.cameraCropSection"
      label={translate('videoEditor.sidebar.cameraCropSection')}
    >
      <CameraCropPreview
        key={`${props.clip.id}:${position?.id ?? 'initial'}`}
        url={props.url}
        sourceTime={Math.max(0, getMediaClipSourceTime(props.clip, props.currentTime))}
        width={transform.width}
        height={transform.height}
        appearance={value}
        mirrored={props.clip.cameraMirrored ?? false}
        fitMode={position?.fitMode ?? props.clip.fitMode}
        disabled={disabled}
        onChange={changeCrop}
      />
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <SliderField
            label={translate('videoEditor.sidebar.cameraCropZoom')}
            min={100}
            max={400}
            step={1}
            value={value.zoom * 100}
            disabled={disabled}
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={(zoom) => changeCrop({ ...value, zoom: zoom / 100 })}
          />
        </div>
        <InspectorActionButton
          compact
          tone="secondary"
          className="h-7! min-h-7! w-7! rounded-md! p-0! shrink-0"
          aria-label={translate('videoEditor.sidebar.cameraCropCenter')}
          title={translate('videoEditor.sidebar.cameraCropCenter')}
          disabled={disabled || (value.panX === 0 && value.panY === 0)}
          onClick={() => changeCrop({ ...value, panX: 0, panY: 0 })}
        >
          <Scan size={14} />
        </InspectorActionButton>
        {position ? (
          <InspectorActionButton
            compact
            tone="secondary"
            className="h-7! min-h-7! w-7! rounded-md! p-0! shrink-0"
            aria-label={translate('videoEditor.sidebar.cameraCropResetPosition')}
            title={translate('videoEditor.sidebar.cameraCropResetPosition')}
            disabled={disabled || position.crop === undefined}
            onClick={() => props.onEdit?.(props.clip.id, { kind: 'crop', crop: null })}
          >
            <RotateCcw size={14} />
          </InspectorActionButton>
        ) : null}
      </div>
    </InspectorDetails>
  );
}
