import type { ScenarioTextElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import {
  InspectorColorField,
  InspectorNativeSelect,
  InspectorNumberField,
  InspectorRangeField,
  InspectorTextField,
} from '../fields';
import { SCENARIO_INSPECTOR_LIMITS } from '../constraints';
import type { ScenarioInspectorElementPatch } from '../types';

export function TextElementFields(props: {
  element: ScenarioTextElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <>
      <InspectorTextField
        label={translate('scenario.editor.text')}
        multiline
        value={props.element.text}
        onCommit={(text) => props.onChange({ text })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.fontSize}
        label={translate('scenario.editor.fontSize')}
        value={props.element.style.fontSize}
        onCommit={(fontSize) => props.onChange({ style: { fontSize } })}
      />
      <InspectorRangeField
        label={translate('scenario.editor.weight')}
        min={SCENARIO_INSPECTOR_LIMITS.fontWeight.min}
        max={SCENARIO_INSPECTOR_LIMITS.fontWeight.max}
        step={SCENARIO_INSPECTOR_LIMITS.fontWeight.step}
        value={props.element.style.fontWeight}
        onCommit={(fontWeight) => props.onChange({ style: { fontWeight } })}
      />
      <InspectorColorField
        label={translate('scenario.editor.color')}
        value={props.element.style.color}
        onCommit={(color) => props.onChange({ style: { color } })}
      />
      <InspectorNativeSelect
        label={translate('scenario.editor.align')}
        value={props.element.style.align}
        options={[
          { label: translate('scenario.editor.alignLeft'), value: 'left' },
          { label: translate('scenario.editor.alignCenter'), value: 'center' },
          { label: translate('scenario.editor.alignRight'), value: 'right' },
        ]}
        onChange={(align) => props.onChange({ style: { align } })}
      />
    </>
  );
}
