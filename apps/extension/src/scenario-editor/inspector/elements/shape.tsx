import type { ScenarioShapeElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import { SCENARIO_INSPECTOR_LIMITS } from '../constraints';
import { InspectorColorField, InspectorNativeSelect, InspectorNumberField } from '../fields';
import type { ScenarioInspectorElementPatch } from '../types';

export function ShapeElementFields(props: {
  element: ScenarioShapeElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <>
      <InspectorNativeSelect
        label={translate('scenario.editor.shape')}
        value={props.element.shape}
        options={[
          { label: translate('scenario.editor.shapeRectangle'), value: 'rect' },
          { label: translate('scenario.editor.shapeEllipse'), value: 'ellipse' },
        ]}
        onChange={(shape) => props.onChange({ shape })}
      />
      <InspectorColorField
        label={translate('scenario.editor.fill')}
        value={props.element.fillColor}
        onCommit={(fillColor) => props.onChange({ fillColor })}
      />
      <InspectorColorField
        label={translate('scenario.editor.stroke')}
        value={props.element.strokeColor}
        onCommit={(strokeColor) => props.onChange({ strokeColor })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.strokeWidth}
        label={translate('scenario.editor.strokeWidth')}
        value={props.element.strokeWidth}
        onCommit={(strokeWidth) => props.onChange({ strokeWidth })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.cornerRadius}
        label={translate('scenario.editor.cornerRadius')}
        value={props.element.cornerRadius}
        onCommit={(cornerRadius) => props.onChange({ cornerRadius })}
      />
    </>
  );
}
