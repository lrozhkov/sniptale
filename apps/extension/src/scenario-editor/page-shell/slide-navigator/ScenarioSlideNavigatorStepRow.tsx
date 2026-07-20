import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioNavigatorStepController } from './types';
import {
  getScenarioNavigatorPreviewRowClassName,
  getScenarioNavigatorStepRowClassName,
  getStepPreview,
  getTrashRowEyebrow,
  handleScenarioNavigatorStepDrop,
  handleStepRowKeyDown,
} from './step-row.helpers';
import {
  ScenarioNavigatorStepActions,
  ScenarioNavigatorStepText,
  ScenarioNavigatorThumbnail,
  ScenarioNavigatorTrashActions,
} from './step-row.parts';

export function ScenarioNavigatorStepRow(props: {
  controller: ScenarioNavigatorStepController;
  dragStepId: string | null;
  index: number;
  onSetDragStepId: (stepId: string | null) => void;
  step: ScenarioStep;
  thumbnailUrl: string | null;
}) {
  const isSelected = props.step.id === props.controller.project.selectedStepId;
  const preview = getStepPreview(props.step);
  const selectStep = () => props.controller.project.setSelectedStepId(props.step.id);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={() => props.onSetDragStepId(props.step.id)}
      onDragEnd={() => props.onSetDragStepId(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() =>
        handleScenarioNavigatorStepDrop({
          controller: props.controller,
          dragStepId: props.dragStepId,
          index: props.index,
          onSetDragStepId: props.onSetDragStepId,
          stepId: props.step.id,
        })
      }
      onClick={selectStep}
      onKeyDown={(event) => handleStepRowKeyDown(event, selectStep)}
      data-ui="scenario.editor.navigator.step"
      data-selected={isSelected ? 'true' : undefined}
      className={getScenarioNavigatorStepRowClassName(isSelected)}
    >
      <ScenarioNavigatorThumbnail step={props.step} thumbnailUrl={props.thumbnailUrl} />
      <ScenarioNavigatorStepText
        eyebrow={String(props.index + 1)}
        index={props.index}
        preview={preview}
        step={props.step}
      />
      <ScenarioNavigatorStepActions controller={props.controller} step={props.step} />
    </div>
  );
}

export function ScenarioNavigatorTrashRow(props: {
  controller: Pick<ScenarioNavigatorStepController, 'ui'>;
  onRestore: () => void;
  step: ScenarioStep;
  thumbnailUrl: string | null;
}) {
  const preview = getStepPreview(props.step);

  return (
    <div className={getScenarioNavigatorPreviewRowClassName()}>
      <ScenarioNavigatorThumbnail step={props.step} thumbnailUrl={props.thumbnailUrl} />
      <ScenarioNavigatorStepText
        eyebrow={getTrashRowEyebrow(props.step)}
        index={0}
        preview={preview}
        step={props.step}
      />
      <ScenarioNavigatorTrashActions
        onRestore={props.onRestore}
        step={props.step}
        ui={props.controller.ui}
      />
    </div>
  );
}
