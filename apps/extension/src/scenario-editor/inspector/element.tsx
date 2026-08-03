import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { SCENARIO_INSPECTOR_LIMITS } from './constraints';
import { ElementSpecificFields } from './element-router';
import { InspectorRangeField, InspectorSection, InspectorTextField } from './fields';
import { getElementKindLabelKey } from './labels';
import type { ScenarioInspectorElementPatch } from './types';

export function SelectedElementInspector(props: {
  element: ScenarioElement;
  onDelete: () => void;
  onEditImageElement?: (elementId: string) => void;
  onUpdateElement: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <div className="grid gap-5">
      <InspectorSection title={translate('scenario.editor.selectedItem')}>
        <InspectorTextField
          label={translate('scenario.editor.name')}
          value={props.element.name}
          onCommit={(name) => props.onUpdateElement({ name })}
        />
        <InspectorRangeField
          displayScale={SCENARIO_INSPECTOR_LIMITS.opacity.displayScale}
          label={translate('scenario.editor.opacity')}
          min={SCENARIO_INSPECTOR_LIMITS.opacity.min}
          max={SCENARIO_INSPECTOR_LIMITS.opacity.max}
          step={SCENARIO_INSPECTOR_LIMITS.opacity.step}
          unit={SCENARIO_INSPECTOR_LIMITS.opacity.unit}
          value={props.element.opacity}
          onCommit={(opacity) => props.onUpdateElement({ opacity })}
        />
      </InspectorSection>
      <InspectorSection title={translate(getElementKindLabelKey(props.element.kind))}>
        <ElementSpecificFields
          element={props.element}
          onChange={props.onUpdateElement}
          {...(props.onEditImageElement ? { onEditImageElement: props.onEditImageElement } : {})}
        />
      </InspectorSection>
      <ProductActionButton compact tone="danger" onClick={props.onDelete}>
        {translate('scenario.editor.removeSelectedItem')}
      </ProductActionButton>
    </div>
  );
}
