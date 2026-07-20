import { translate } from '../../../../../platform/i18n';
import { isShapeClip } from '../../../../../features/video/project/timeline';
import { VideoProjectShapeType } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { ColorField } from '../shared/controls';
import { SliderField } from '../shared/sliders';

export function renderShapeStyleFields(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrackLocked: boolean,
  onUpdateShapeStyle: WorkspaceSidebarProps['onUpdateShapeStyle'],
  recentColors?: WorkspaceSidebarProps['recentColors'],
  onRememberRecentColor?: WorkspaceSidebarProps['onRememberRecentColor']
) {
  if (!selectedClip || !isShapeClip(selectedClip)) return null;
  const connector = isConnectorShapeType(selectedClip.shapeType);
  return (
    <div className="space-y-3">
      {connector ? null : (
        <ColorField
          label={translate('videoEditor.sidebar.fillLabel')}
          disabled={selectedTrackLocked}
          recentColors={recentColors}
          onRememberRecentColor={onRememberRecentColor}
          value={selectedClip.style.fillColor}
          onChange={(value) => onUpdateShapeStyle(selectedClip.id, { fillColor: value })}
        />
      )}
      <ColorField
        label={translate('videoEditor.sidebar.strokeLabel')}
        disabled={selectedTrackLocked}
        recentColors={recentColors}
        onRememberRecentColor={onRememberRecentColor}
        value={selectedClip.style.strokeColor}
        onChange={(value) => onUpdateShapeStyle(selectedClip.id, { strokeColor: value })}
      />
      <ShapeStyleStrokeWidthField
        clipId={selectedClip.id}
        disabled={selectedTrackLocked}
        strokeWidth={selectedClip.style.strokeWidth}
        onUpdateShapeStyle={onUpdateShapeStyle}
      />
      {connector ? null : (
        <SliderField
          label={translate('videoEditor.sidebar.radiusLabel')}
          disabled={selectedTrackLocked}
          value={selectedClip.style.borderRadius}
          min={0}
          max={100}
          step={1}
          formatValue={(value) => `${Math.round(value)} px`}
          onChange={(value) => onUpdateShapeStyle(selectedClip.id, { borderRadius: value })}
        />
      )}
    </div>
  );
}

function ShapeStyleStrokeWidthField(props: {
  clipId: string;
  disabled: boolean;
  onUpdateShapeStyle: WorkspaceSidebarProps['onUpdateShapeStyle'];
  strokeWidth: number;
}) {
  return (
    <SliderField
      label={translate('videoEditor.sidebar.strokeWidthLabel')}
      disabled={props.disabled}
      value={props.strokeWidth}
      min={0}
      max={32}
      step={1}
      formatValue={(value) => `${Math.round(value)} px`}
      onChange={(value) => props.onUpdateShapeStyle(props.clipId, { strokeWidth: value })}
    />
  );
}

function isConnectorShapeType(shapeType: VideoProjectShapeType) {
  return shapeType === VideoProjectShapeType.LINE || shapeType === VideoProjectShapeType.ARROW;
}
