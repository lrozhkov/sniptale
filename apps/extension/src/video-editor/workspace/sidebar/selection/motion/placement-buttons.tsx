import { InspectorActionButton } from '../shared/actions';

export function MotionPlacementButtonGroup(props: {
  isPickingOnStage: boolean;
  onPick: () => void;
  onReset: () => void;
  pickLabel: string;
  resetLabel: string;
}) {
  return (
    <div data-ui="video-editor.inspector.actions">
      <InspectorActionButton
        compact
        tone="toggle"
        active={props.isPickingOnStage}
        aria-pressed={props.isPickingOnStage}
        onClick={props.onPick}
      >
        {props.pickLabel}
      </InspectorActionButton>
      <InspectorActionButton compact tone="secondary" onClick={props.onReset}>
        {props.resetLabel}
      </InspectorActionButton>
    </div>
  );
}
