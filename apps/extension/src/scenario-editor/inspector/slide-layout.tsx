import { SCENARIO_SLIDE_COMPOSITION_PRESETS } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../platform/i18n';
import { InspectorNativeSelect, InspectorSection } from './fields';
import { getCompositionPresetLabelKey } from './labels';
import { createInspectorLayoutOptions } from './project-presentation';
import type { ScenarioInspectorProps, ScenarioInspectorSlidePatch } from './types';

type InspectorSlide = NonNullable<ScenarioInspectorProps['slide']>;

export function SlideLayoutFields(props: {
  onUpdateSlide: (patch: ScenarioInspectorSlidePatch) => void;
  slide: InspectorSlide;
}) {
  return (
    <InspectorSection title={translate('scenario.editor.layout')}>
      <InspectorNativeSelect
        label={translate('scenario.editor.layout')}
        options={createInspectorLayoutOptions()}
        value={props.slide.layout.layoutId}
        onChange={(layoutId) =>
          props.onUpdateSlide({ layout: { ...props.slide.layout, layoutId } })
        }
      />
      <InspectorNativeSelect
        label={translate('scenario.editor.compositionPreset')}
        options={Object.values(SCENARIO_SLIDE_COMPOSITION_PRESETS).map((value) => ({
          label: translate(getCompositionPresetLabelKey(value)),
          value,
        }))}
        value={props.slide.layout.compositionPreset}
        onChange={(compositionPreset) =>
          props.onUpdateSlide({ layout: { ...props.slide.layout, compositionPreset } })
        }
      />
    </InspectorSection>
  );
}
