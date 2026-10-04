import { getScenarioRecorderSidebarStepCardClassName } from './step-card.helpers';
import { ScenarioRecorderStepBody, ScenarioRecorderStepRail } from './step-card.parts';
import type { ScenarioRecorderSidebarStep } from './types';

export function ScenarioRecorderSidebarStepCard(props: {
  highlightedStepId: string | null;
  moveUpIndex: number | null;
  moveDownIndex: number | null;
  onDeleteStep: (stepId: string) => void;
  onInspectStep: (step: ScenarioRecorderSidebarStep) => void;
  onMoveStep: (stepId: string, toIndex: number) => void;
  onPreviewOpen: (step: ScenarioRecorderSidebarStep) => void;
  step: ScenarioRecorderSidebarStep;
}) {
  return (
    <article
      data-ui="content.scenario.sidebar.step"
      className={`${getScenarioRecorderSidebarStepCardClassName(
        props.highlightedStepId === props.step.id
      )} min-w-0 max-w-full`}
    >
      <ScenarioRecorderStepRail
        onMoveStep={props.onMoveStep}
        moveUpIndex={props.moveUpIndex}
        moveDownIndex={props.moveDownIndex}
        onDeleteStep={props.onDeleteStep}
        onInspectStep={props.onInspectStep}
        step={props.step}
      />
      <ScenarioRecorderStepBody onPreviewOpen={props.onPreviewOpen} step={props.step} />
    </article>
  );
}
