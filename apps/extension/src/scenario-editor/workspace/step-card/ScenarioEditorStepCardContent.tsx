import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import {
  CaptureStepContent,
  DividerStepContent,
  NoteStepContent,
  SectionStepContent,
} from './content.parts';

export function ScenarioEditorStepCardContent(props: {
  step: ScenarioStep;
  onOpenQuickEdit: () => void;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
}) {
  switch (props.step.kind) {
    case 'capture':
      return (
        <CaptureStepContent
          step={props.step}
          onOpenQuickEdit={props.onOpenQuickEdit}
          onUpdateStep={props.onUpdateStep}
        />
      );
    case 'section':
      return <SectionStepContent step={props.step} onUpdateStep={props.onUpdateStep} />;
    case 'divider':
      return <DividerStepContent step={props.step} onUpdateStep={props.onUpdateStep} />;
    case 'note':
    default:
      return <NoteStepContent step={props.step} onUpdateStep={props.onUpdateStep} />;
  }
}
