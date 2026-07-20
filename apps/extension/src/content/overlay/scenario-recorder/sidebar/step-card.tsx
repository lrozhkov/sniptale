import type { DragEventHandler } from 'react';
import { getScenarioRecorderSidebarStepCardClassName, handleStepDrop } from './step-card.helpers';
import { ScenarioRecorderStepBody, ScenarioRecorderStepRail } from './step-card.parts';
import type { ScenarioRecorderSidebarStep } from './types';

function createStepDropHandler(args: {
  dragStepId: string | null;
  step: ScenarioRecorderSidebarStep;
  onMoveStep: (stepId: string, toIndex: number) => void;
  setDragStepId: (stepId: string | null) => void;
}) {
  return () =>
    handleStepDrop({
      dragStepId: args.dragStepId,
      stepId: args.step.id,
      stepPosition: args.step.position,
      onMoveStep: args.onMoveStep,
      setDragStepId: args.setDragStepId,
    });
}

function createStepDragOverHandler(): DragEventHandler<HTMLElement> {
  return (event) => event.preventDefault();
}

export function ScenarioRecorderSidebarStepCard(props: {
  dragStepId: string | null;
  highlightedStepId: string | null;
  index: number;
  onDeleteStep: (stepId: string) => void;
  onInspectStep: (step: ScenarioRecorderSidebarStep) => void;
  onMoveStep: (stepId: string, toIndex: number) => void;
  onPreviewOpen: (step: ScenarioRecorderSidebarStep) => void;
  setDragStepId: (stepId: string | null) => void;
  step: ScenarioRecorderSidebarStep;
}) {
  const handleDrop = createStepDropHandler({
    dragStepId: props.dragStepId,
    step: props.step,
    onMoveStep: props.onMoveStep,
    setDragStepId: props.setDragStepId,
  });
  const stepNumber = props.step.position + 1;

  return (
    <article
      data-ui="content.scenario.sidebar.step"
      draggable
      onDragStart={() => props.setDragStepId(props.step.id)}
      onDragEnd={() => props.setDragStepId(null)}
      onDragOver={createStepDragOverHandler()}
      onDrop={handleDrop}
      className={`${getScenarioRecorderSidebarStepCardClassName(
        props.highlightedStepId === props.step.id
      )} min-w-0 max-w-full`}
    >
      <ScenarioRecorderStepRail
        onDeleteStep={props.onDeleteStep}
        onInspectStep={props.onInspectStep}
        step={props.step}
        stepNumber={stepNumber}
      />
      <ScenarioRecorderStepBody onPreviewOpen={props.onPreviewOpen} step={props.step} />
    </article>
  );
}
