import { translate } from '../../platform/i18n';
import { InspectorSection, InspectorTextField } from './fields';
import type { ScenarioInspectorProps, ScenarioInspectorSlidePatch } from './types';

type InspectorSlide = NonNullable<ScenarioInspectorProps['slide']>;

export function SlideInspector(props: {
  onUpdateSlide: (patch: ScenarioInspectorSlidePatch) => void;
  slide: InspectorSlide;
}) {
  return (
    <div className="grid gap-5">
      <SlideTextFields onUpdateSlide={props.onUpdateSlide} slide={props.slide} />
    </div>
  );
}

function SlideTextFields(props: {
  onUpdateSlide: (patch: ScenarioInspectorSlidePatch) => void;
  slide: InspectorSlide;
}) {
  return (
    <InspectorSection title={translate('scenario.editor.stepDetails')}>
      <InspectorTextField
        label={translate('scenario.editor.fieldTitle')}
        value={props.slide.title}
        onCommit={(title) => props.onUpdateSlide({ title })}
      />
      <InspectorTextField
        label={translate('scenario.editor.notes')}
        multiline
        value={props.slide.notes}
        onCommit={(notes) => props.onUpdateSlide({ notes })}
      />
    </InspectorSection>
  );
}
