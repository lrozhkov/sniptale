import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import { ScenarioQuickEditPointFields } from './ScenarioQuickEditFields';
import { updatePointOverlay } from './overlay-editor.helpers';

type PointOverlay = Extract<ScenarioOverlay, { point: { x: number; y: number } }>;

export function ScenarioQuickEditOverlayPointFields(props: {
  overlay: PointOverlay;
  onChange: (overlay: ScenarioOverlay) => void;
}) {
  return (
    <ScenarioQuickEditPointFields
      x={props.overlay.point.x}
      y={props.overlay.point.y}
      onXChange={(value) => props.onChange(updatePointOverlay(props.overlay, { x: value }))}
      onYChange={(value) => props.onChange(updatePointOverlay(props.overlay, { y: value }))}
    />
  );
}
