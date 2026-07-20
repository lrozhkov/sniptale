import { translate } from '../../platform/i18n';
import { SCENARIO_INSPECTOR_LIMITS } from './constraints';
import { InspectorNativeSelect, InspectorNumberField, InspectorSection } from './fields';
import {
  createInspectorBackgroundTransitionOptions,
  createInspectorTransitionOptions,
} from './project-presentation';
import type { ScenarioInspectorProps, ScenarioInspectorSlidePatch } from './types';

type InspectorSlide = NonNullable<ScenarioInspectorProps['slide']>;

export function SlidePresentationFields(props: {
  onUpdateSlide: (patch: ScenarioInspectorSlidePatch) => void;
  slide: InspectorSlide;
}) {
  return (
    <InspectorSection title={translate('scenario.editor.presentation')}>
      <InspectorNativeSelect
        label={translate('scenario.editor.transition')}
        options={createInspectorTransitionOptions()}
        value={props.slide.transition?.kind ?? 'none'}
        onChange={(kind) =>
          props.onUpdateSlide({ transition: { durationMs: 420, easing: 'ease', kind } })
        }
      />
      <InspectorNativeSelect
        label={translate('scenario.editor.backgroundTransition')}
        options={createInspectorBackgroundTransitionOptions()}
        value={props.slide.backgroundTransition?.kind ?? 'none'}
        onChange={(kind) =>
          props.onUpdateSlide({
            backgroundTransition: { durationMs: 420, easing: 'ease', kind },
          })
        }
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.clickCount}
        label={translate('scenario.editor.clicks')}
        value={props.slide.clicks.count}
        onCommit={(count) => props.onUpdateSlide({ clicks: { count } })}
      />
    </InspectorSection>
  );
}
