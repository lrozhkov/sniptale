import { useContext } from 'react';
import { Scan } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  activeCameraPosition,
  type CameraPositionEdit,
} from '../../../../../features/video/project/camera/animation';
import {
  DEFAULT_CAMERA_APPEARANCE,
  type CameraAppearance,
} from '../../../../../features/video/project/camera/appearance';
import { InspectorDetails } from '../shared/details';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import type { VideoProjectVideoClip } from '../../../../../features/video/project/types';
import { RuntimePreviewContext } from '../../../../runtime/controller/composition/contexts';
import { translate } from '../../../../../platform/i18n';
import { SelectInput } from '../shared/controls';
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
  const value = props.clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE;
  const position = activeCameraPosition(props.clip, props.currentTime);
  const transform = position?.transform ?? props.clip.transform;
  const disabled = props.disabled || !props.onEdit;
  const change = (appearance: CameraAppearance) =>
    props.onEdit?.(props.clip.id, { kind: 'appearance', appearance });
  return (
    <div className="space-y-2" data-ui="video-editor.camera-appearance">
      <SelectInput
        label={translate('videoEditor.sidebar.cameraShape')}
        value={value.shape}
        disabled={disabled}
        options={[
          { value: 'rounded', label: translate('videoEditor.sidebar.cameraShapeRounded') },
          { value: 'soft', label: translate('videoEditor.sidebar.cameraShapeSoft') },
          { value: 'ellipse', label: translate('videoEditor.sidebar.cameraShapeEllipse') },
        ]}
        onChange={(shape) => change({ ...value, shape })}
      />
      {(['width', 'height'] as const).map((field) => (
        <SliderField
          key={field}
          label={translate(
            field === 'width' ? 'videoEditor.sidebar.widthLabel' : 'videoEditor.sidebar.heightLabel'
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
      ))}
      {value.shape !== 'ellipse' ? (
        <SliderField
          label={translate('videoEditor.sidebar.cameraRoundness')}
          min={0}
          max={100}
          step={1}
          value={value.roundness}
          disabled={disabled}
          formatValue={(v) => `${Math.round(v)}%`}
          onChange={(roundness) => change({ ...value, roundness })}
        />
      ) : null}
      <InspectorDetails label={translate('videoEditor.sidebar.cameraCropSection')}>
        <CameraCropPreview
          key={props.clip.id}
          url={runtime?.assetUrls[props.clip.assetId]}
          sourceTime={props.clip.sourceStart + Math.min(0.5, props.clip.sourceDuration / 2)}
          width={transform.width}
          height={transform.height}
          appearance={value}
          fitMode={position?.fitMode ?? props.clip.fitMode}
          disabled={disabled}
          onChange={change}
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
              onChange={(zoom) => change({ ...value, zoom: zoom / 100 })}
            />
          </div>
          <ProductActionButton
            compact
            tone="secondary"
            className="h-7! min-h-7! w-7! rounded-md! p-0! shrink-0"
            aria-label={translate('videoEditor.sidebar.cameraCropCenter')}
            title={translate('videoEditor.sidebar.cameraCropCenter')}
            disabled={disabled || (value.panX === 0 && value.panY === 0)}
            onClick={() => change({ ...value, panX: 0, panY: 0 })}
          >
            <Scan size={14} />
          </ProductActionButton>
        </div>
      </InspectorDetails>
    </div>
  );
}
