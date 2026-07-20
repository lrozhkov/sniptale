import type { ScenarioCalloutElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import { SCENARIO_INSPECTOR_LIMITS } from '../constraints';
import { InspectorColorField, InspectorNumberField, InspectorTextField } from '../fields';
import type { ScenarioInspectorElementPatch } from '../types';

export function CalloutElementFields(props: {
  element: ScenarioCalloutElement;
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
      <InspectorColorField
        label={translate('scenario.editor.panel')}
        value={props.element.panel.backgroundColor}
        onCommit={(backgroundColor) => props.onChange({ panel: { backgroundColor } })}
      />
      <InspectorColorField
        label={translate('scenario.editor.border')}
        value={props.element.panel.borderColor}
        onCommit={(borderColor) => props.onChange({ panel: { borderColor } })}
      />
      <InspectorColorField
        label={translate('scenario.editor.textColor')}
        value={props.element.panel.textColor}
        onCommit={(textColor) => props.onChange({ panel: { textColor } })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.borderWidth}
        label={translate('scenario.editor.borderWidth')}
        value={props.element.panel.borderWidth}
        onCommit={(borderWidth) => props.onChange({ panel: { borderWidth } })}
      />
      <button
        type="button"
        className="sniptale-secondary-button"
        onClick={() =>
          props.onChange({ connector: props.element.connector ? null : createConnector() })
        }
      >
        {props.element.connector
          ? translate('scenario.editor.removeConnector')
          : translate('scenario.editor.addConnector')}
      </button>
    </>
  );
}

function createConnector(): ScenarioCalloutElement['connector'] {
  return {
    end: { x: 520, y: 240 },
    start: { x: 760, y: 240 },
  };
}
