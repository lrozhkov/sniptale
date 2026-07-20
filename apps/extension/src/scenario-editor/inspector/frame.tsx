import type {
  ScenarioElement,
  ScenarioElementFrame,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { SCENARIO_INSPECTOR_LIMITS } from './constraints';
import { InspectorNumberField } from './fields';

export function FrameFields(props: {
  element: ScenarioElement;
  onFrameChange: (frame: Partial<ScenarioElementFrame>) => void;
}) {
  return (
    <div className="grid gap-2.5">
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.coordinate}
        label="X"
        value={props.element.frame.x}
        onCommit={(x) => props.onFrameChange({ x })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.coordinate}
        label="Y"
        value={props.element.frame.y}
        onCommit={(y) => props.onFrameChange({ y })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.elementWidth}
        label="Width"
        value={props.element.frame.width}
        onCommit={(width) => props.onFrameChange({ width })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.elementHeight}
        label="Height"
        value={props.element.frame.height}
        onCommit={(height) => props.onFrameChange({ height })}
      />
    </div>
  );
}
