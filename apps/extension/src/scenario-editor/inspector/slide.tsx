import { translate } from '../../platform/i18n';
import { InspectorSection, InspectorTextField } from './fields';
import { ProjectPresentationFields } from './project-presentation';
import { SlideCanvasFields } from './slide-canvas';
import { SlideLayoutFields } from './slide-layout';
import { SlidePresentationFields } from './slide-presentation';
import type {
  ScenarioInspectorProjectPresentationPatch,
  ScenarioInspectorProps,
  ScenarioInspectorSlidePatch,
} from './types';

type InspectorSlide = NonNullable<ScenarioInspectorProps['slide']>;

export function SlideInspector(props: {
  onUpdatePresentation?: (patch: ScenarioInspectorProjectPresentationPatch) => void;
  onUpdateSlide: (patch: ScenarioInspectorSlidePatch) => void;
  presentation?: ScenarioInspectorProps['presentation'];
  slide: InspectorSlide;
}) {
  return (
    <div className="grid gap-5">
      {props.presentation && props.onUpdatePresentation ? (
        <ProjectPresentationFields
          onUpdatePresentation={props.onUpdatePresentation}
          presentation={props.presentation}
        />
      ) : null}
      <SlideTextFields onUpdateSlide={props.onUpdateSlide} slide={props.slide} />
      <SlideLayoutFields onUpdateSlide={props.onUpdateSlide} slide={props.slide} />
      <SlidePresentationFields onUpdateSlide={props.onUpdateSlide} slide={props.slide} />
      <SlideCanvasFields onUpdateSlide={props.onUpdateSlide} slide={props.slide} />
    </div>
  );
}

function SlideTextFields(props: {
  onUpdateSlide: (patch: ScenarioInspectorSlidePatch) => void;
  slide: InspectorSlide;
}) {
  return (
    <InspectorSection title={translate('scenario.editor.slide')}>
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
