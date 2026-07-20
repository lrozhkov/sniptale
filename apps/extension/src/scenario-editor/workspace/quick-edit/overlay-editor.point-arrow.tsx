import { translate } from '../../../platform/i18n';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import {
  ScenarioQuickEditNumberField,
  ScenarioQuickEditTextField,
} from './ScenarioQuickEditFields';
import { ScenarioQuickEditOverlayPointFields } from './overlay-editor.point-fields';

export function PointOverlayEditor(props: {
  overlay: Extract<ScenarioOverlay, { point: unknown }>;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ScenarioQuickEditOverlayPointFields overlay={props.overlay} onChange={props.onChange} />
    </div>
  );
}

export function ArrowOverlayEditor(props: {
  overlay: Extract<ScenarioOverlay, { kind: 'arrow' }>;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  const onStartXChange = (value: number) =>
    props.onChange({ ...props.overlay, start: { ...props.overlay.start, x: value } });
  const onStartYChange = (value: number) =>
    props.onChange({ ...props.overlay, start: { ...props.overlay.start, y: value } });
  const onEndXChange = (value: number) =>
    props.onChange({ ...props.overlay, end: { ...props.overlay.end, x: value } });
  const onEndYChange = (value: number) =>
    props.onChange({ ...props.overlay, end: { ...props.overlay.end, y: value } });

  return (
    <div className="grid gap-3">
      <ArrowOverlayCoordinateFields
        endX={props.overlay.end.x}
        endY={props.overlay.end.y}
        onEndXChange={onEndXChange}
        onEndYChange={onEndYChange}
        onStartXChange={onStartXChange}
        onStartYChange={onStartYChange}
        startX={props.overlay.start.x}
        startY={props.overlay.start.y}
      />
      <ArrowOverlayStyleFields
        color={props.overlay.color}
        onColorChange={(value) => props.onChange({ ...props.overlay, color: value })}
        onStrokeWidthChange={(value) => props.onChange({ ...props.overlay, strokeWidth: value })}
        strokeWidth={props.overlay.strokeWidth}
      />
    </div>
  );
}

function ArrowOverlayCoordinateFields(props: {
  endX: number;
  endY: number;
  onEndXChange: (value: number) => void;
  onEndYChange: (value: number) => void;
  onStartXChange: (value: number) => void;
  onStartYChange: (value: number) => void;
  startX: number;
  startY: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ScenarioQuickEditNumberField
        label="Start X"
        value={props.startX}
        onChange={props.onStartXChange}
      />
      <ScenarioQuickEditNumberField
        label="Start Y"
        value={props.startY}
        onChange={props.onStartYChange}
      />
      <ScenarioQuickEditNumberField
        label="End X"
        value={props.endX}
        onChange={props.onEndXChange}
      />
      <ScenarioQuickEditNumberField
        label="End Y"
        value={props.endY}
        onChange={props.onEndYChange}
      />
    </div>
  );
}

function ArrowOverlayStyleFields(props: {
  color: string;
  onColorChange: (value: string) => void;
  onStrokeWidthChange: (value: number) => void;
  strokeWidth: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ScenarioQuickEditTextField
        label={translate('scenario.editor.color')}
        value={props.color}
        onChange={props.onColorChange}
      />
      <ScenarioQuickEditNumberField
        label={translate('scenario.editor.strokeWidth')}
        value={props.strokeWidth}
        min={1}
        max={24}
        onChange={props.onStrokeWidthChange}
      />
    </div>
  );
}
