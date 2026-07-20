import { translate } from '../../../../../platform/i18n';
import { isAudioClip } from '../../../../../features/video/project/timeline';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { NumberInput } from './number';
import { SliderField } from '../shared/sliders';

const VIDEO_TRANSFORM_COORDINATE_LIMIT = 7680;
const VIDEO_TRANSFORM_SIZE_MAX = 7680;

export function renderTransformFields(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrackLocked: boolean,
  onUpdateClipTransform: WorkspaceSidebarProps['onUpdateClipTransform']
) {
  if (!selectedClip || isAudioClip(selectedClip)) return null;
  return (
    <div className="space-y-3">
      <TransformGeometryFields
        clip={selectedClip}
        disabled={selectedTrackLocked}
        onUpdateClipTransform={onUpdateClipTransform}
      />
      <NumberInput
        label={translate('videoEditor.sidebar.rotationLabel')}
        disabled={selectedTrackLocked}
        value={selectedClip.transform.rotation}
        min={-360}
        max={360}
        step={1}
        scrub
        unit="deg"
        onChange={(value) => onUpdateClipTransform(selectedClip.id, { rotation: value })}
      />
      <SliderField
        label={translate('videoEditor.sidebar.opacityLabel')}
        disabled={selectedTrackLocked}
        value={selectedClip.transform.opacity}
        min={0}
        max={1}
        step={0.01}
        formatValue={(value) => `${Math.round(value * 100)}%`}
        onChange={(value) => onUpdateClipTransform(selectedClip.id, { opacity: value })}
      />
    </div>
  );
}

function TransformGeometryFields(props: {
  clip: Exclude<NonNullable<WorkspaceSidebarProps['selectedClip']>, { type: 'AUDIO' }>;
  disabled: boolean;
  onUpdateClipTransform: WorkspaceSidebarProps['onUpdateClipTransform'];
}) {
  return (
    <>
      <TransformNumberField
        {...props}
        field="x"
        label="X"
        max={VIDEO_TRANSFORM_COORDINATE_LIMIT}
        min={-VIDEO_TRANSFORM_COORDINATE_LIMIT}
      />
      <TransformNumberField
        {...props}
        field="y"
        label="Y"
        max={VIDEO_TRANSFORM_COORDINATE_LIMIT}
        min={-VIDEO_TRANSFORM_COORDINATE_LIMIT}
      />
      <TransformNumberField
        {...props}
        field="width"
        label={translate('videoEditor.sidebar.widthLabel')}
        max={VIDEO_TRANSFORM_SIZE_MAX}
        min={40}
      />
      <TransformNumberField
        {...props}
        field="height"
        label={translate('videoEditor.sidebar.heightLabel')}
        max={VIDEO_TRANSFORM_SIZE_MAX}
        min={40}
      />
    </>
  );
}

function TransformNumberField(props: {
  clip: Exclude<NonNullable<WorkspaceSidebarProps['selectedClip']>, { type: 'AUDIO' }>;
  disabled: boolean;
  field: 'height' | 'width' | 'x' | 'y';
  label: string;
  max: number;
  min: number;
  onUpdateClipTransform: WorkspaceSidebarProps['onUpdateClipTransform'];
}) {
  return (
    <NumberInput
      label={props.label}
      disabled={props.disabled}
      min={props.min}
      max={props.max}
      scrub
      unit="px"
      value={props.clip.transform[props.field]}
      onChange={(value) => props.onUpdateClipTransform(props.clip.id, { [props.field]: value })}
    />
  );
}
