import {
  SCENARIO_ELEMENT_ANIMATIONS,
  type ScenarioElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../platform/i18n';
import { SCENARIO_INSPECTOR_LIMITS } from './constraints';
import { ElementSpecificFields } from './element-router';
import {
  InspectorNativeSelect,
  InspectorNumberField,
  InspectorRangeField,
  InspectorSection,
  InspectorTextField,
} from './fields';
import { FrameFields } from './frame';
import { getAnimationLabelKey, getElementKindLabelKey } from './labels';
import type { ScenarioInspectorElementPatch } from './types';

export function SelectedElementInspector(props: {
  element: ScenarioElement;
  onEditImageElement?: (elementId: string) => void;
  onUpdateElement: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <div className="grid gap-5">
      <InspectorSection title={translate('scenario.editor.element')}>
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
      <InspectorSection title={translate('scenario.editor.frame')}>
        <FrameFields
          element={props.element}
          onFrameChange={(frame) => props.onUpdateElement({ frame })}
        />
      </InspectorSection>
      <InspectorSection title={translate(getElementKindLabelKey(props.element.kind))}>
        <ElementSpecificFields
          element={props.element}
          onChange={props.onUpdateElement}
          {...(props.onEditImageElement ? { onEditImageElement: props.onEditImageElement } : {})}
        />
      </InspectorSection>
      <ElementBuildFields element={props.element} onUpdateElement={props.onUpdateElement} />
    </div>
  );
}

function ElementBuildFields(props: {
  element: ScenarioElement;
  onUpdateElement: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <InspectorSection title={translate('scenario.editor.build')}>
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.buildIndex}
        label={translate('scenario.editor.showAtClick')}
        value={props.element.build.showAtClick}
        onCommit={(showAtClick) => props.onUpdateElement({ build: { showAtClick } })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.buildIndex}
        label={translate('scenario.editor.hideAtClick')}
        value={props.element.build.hideAtClick ?? 0}
        onCommit={(value) =>
          props.onUpdateElement({ build: { hideAtClick: value > 0 ? value : null } })
        }
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.buildIndex}
        label={translate('scenario.editor.order')}
        value={props.element.build.order}
        onCommit={(order) => props.onUpdateElement({ build: { order } })}
      />
      <InspectorNativeSelect
        label={translate('scenario.editor.animation')}
        options={Object.values(SCENARIO_ELEMENT_ANIMATIONS).map((value) => ({
          label: translate(getAnimationLabelKey(value)),
          value,
        }))}
        value={props.element.animation.preset}
        onChange={(preset) => props.onUpdateElement({ animation: { preset } })}
      />
    </InspectorSection>
  );
}
