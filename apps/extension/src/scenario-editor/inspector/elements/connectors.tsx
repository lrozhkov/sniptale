import type {
  ScenarioArrowElement,
  ScenarioLineElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import { SCENARIO_INSPECTOR_LIMITS } from '../constraints';
import { InspectorColorField, InspectorNativeSelect, InspectorNumberField } from '../fields';
import type { ScenarioInspectorElementPatch } from '../types';

function ConnectorFields(props: {
  element: ScenarioArrowElement | ScenarioLineElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <>
      <ConnectorCoordinateFields {...props} />
      <InspectorColorField
        label={translate('scenario.editor.stroke')}
        value={props.element.strokeColor}
        onCommit={(strokeColor) => props.onChange({ strokeColor })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.lineStrokeWidth}
        label={translate('scenario.editor.strokeWidth')}
        value={props.element.strokeWidth}
        onCommit={(strokeWidth) => props.onChange({ strokeWidth })}
      />
      <InspectorNativeSelect
        label={translate('scenario.editor.dash')}
        value={props.element.dash}
        options={[
          { label: translate('scenario.editor.dashSolid'), value: 'solid' },
          { label: translate('scenario.editor.dashDashed'), value: 'dashed' },
          { label: translate('scenario.editor.dashDotted'), value: 'dotted' },
        ]}
        onChange={(dash) => props.onChange({ dash })}
      />
    </>
  );
}

function ConnectorCoordinateFields(props: {
  element: ScenarioArrowElement | ScenarioLineElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <>
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.coordinate}
        label={translate('scenario.editor.startX')}
        value={props.element.start.x}
        onCommit={(x) => props.onChange({ start: { ...props.element.start, x } })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.coordinate}
        label={translate('scenario.editor.startY')}
        value={props.element.start.y}
        onCommit={(y) => props.onChange({ start: { ...props.element.start, y } })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.coordinate}
        label={translate('scenario.editor.endX')}
        value={props.element.end.x}
        onCommit={(x) => props.onChange({ end: { ...props.element.end, x } })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.coordinate}
        label={translate('scenario.editor.endY')}
        value={props.element.end.y}
        onCommit={(y) => props.onChange({ end: { ...props.element.end, y } })}
      />
    </>
  );
}

export function LineElementFields(props: {
  element: ScenarioLineElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return <ConnectorFields element={props.element} onChange={props.onChange} />;
}

export function ArrowElementFields(props: {
  element: ScenarioArrowElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <>
      <ConnectorFields element={props.element} onChange={props.onChange} />
      <InspectorNativeSelect
        label={translate('scenario.editor.head')}
        value={props.element.head}
        options={[
          { label: translate('scenario.editor.headStart'), value: 'start' },
          { label: translate('scenario.editor.headEnd'), value: 'end' },
          { label: translate('scenario.editor.headBoth'), value: 'both' },
        ]}
        onChange={(head) => props.onChange({ head })}
      />
    </>
  );
}
