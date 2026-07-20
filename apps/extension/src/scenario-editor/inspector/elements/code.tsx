import type { ScenarioCodeElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import { SCENARIO_INSPECTOR_LIMITS } from '../constraints';
import { InspectorColorField, InspectorNumberField, InspectorTextField } from '../fields';
import type { ScenarioInspectorElementPatch } from '../types';

export function CodeElementFields(props: {
  element: ScenarioCodeElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <>
      <InspectorTextField
        label={translate('scenario.editor.code')}
        multiline
        value={props.element.code}
        onCommit={(code) => props.onChange({ code })}
      />
      <InspectorTextField
        label={translate('scenario.editor.language')}
        value={props.element.language}
        onCommit={(language) => props.onChange({ language })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.fontSize}
        label={translate('scenario.editor.fontSize')}
        value={props.element.style.fontSize}
        onCommit={(fontSize) => props.onChange({ style: { fontSize } })}
      />
      <InspectorColorField
        label={translate('scenario.editor.panel')}
        value={props.element.style.backgroundColor}
        onCommit={(backgroundColor) => props.onChange({ style: { backgroundColor } })}
      />
      <InspectorColorField
        label={translate('scenario.editor.textColor')}
        value={props.element.style.textColor}
        onCommit={(textColor) => props.onChange({ style: { textColor } })}
      />
    </>
  );
}
