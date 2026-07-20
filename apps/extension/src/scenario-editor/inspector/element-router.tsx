import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { CalloutElementFields } from './elements/callout';
import { ArrowElementFields, LineElementFields } from './elements/connectors';
import { CodeElementFields } from './elements/code';
import { ImageElementFields } from './elements/image';
import { ShapeElementFields } from './elements/shape';
import { TextElementFields } from './elements/text';
import type { ScenarioInspectorElementPatch } from './types';

function assertNever(value: never): never {
  throw new Error(`Unsupported inspector element kind: ${String(value)}`);
}

export function ElementSpecificFields(props: {
  element: ScenarioElement;
  onEditImageElement?: (elementId: string) => void;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
}) {
  switch (props.element.kind) {
    case SCENARIO_V3_ELEMENT_KINDS.arrow:
      return <ArrowElementFields element={props.element} onChange={props.onChange} />;
    case SCENARIO_V3_ELEMENT_KINDS.callout:
      return <CalloutElementFields element={props.element} onChange={props.onChange} />;
    case SCENARIO_V3_ELEMENT_KINDS.code:
      return <CodeElementFields element={props.element} onChange={props.onChange} />;
    case SCENARIO_V3_ELEMENT_KINDS.image:
      return (
        <ImageElementFields
          element={props.element}
          onChange={props.onChange}
          {...(props.onEditImageElement ? { onEditImageElement: props.onEditImageElement } : {})}
        />
      );
    case SCENARIO_V3_ELEMENT_KINDS.line:
      return <LineElementFields element={props.element} onChange={props.onChange} />;
    case SCENARIO_V3_ELEMENT_KINDS.shape:
      return <ShapeElementFields element={props.element} onChange={props.onChange} />;
    case SCENARIO_V3_ELEMENT_KINDS.text:
      return <TextElementFields element={props.element} onChange={props.onChange} />;
  }

  return assertNever(props.element);
}
