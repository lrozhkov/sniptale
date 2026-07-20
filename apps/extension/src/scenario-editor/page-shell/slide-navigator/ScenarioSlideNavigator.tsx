import { useMemo, useState } from 'react';
import { translate } from '../../../platform/i18n';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import { InspectorShellFrame, InspectorShellPanel } from '@sniptale/ui/inspector-shell';
import { ScenarioSlideNavigatorAiEditorView } from './ScenarioSlideNavigatorAiEditorView';
import {
  SCENARIO_EDITOR_NAVIGATOR_COLLAPSED_WIDTH_CLASS,
  SCENARIO_EDITOR_NAVIGATOR_EXPANDED_WIDTH_CLASS,
} from '../layout/constants';
import { ScenarioNavigatorPanelContent } from './sections';
import { useScenarioNavigatorThumbnails } from './thumbnails';
import type { ScenarioSlideNavigatorController } from './types';
import { ScenarioSlideNavigatorProjectsView } from './ScenarioSlideNavigatorProjectsView';

const EMPTY_SCENARIO_STEPS: ScenarioStep[] = [];

function ScenarioSlideNavigatorCollapsedRail() {
  return (
    <div className="flex h-full flex-col items-center px-2 py-3">
      <div
        className="rounded-full border border-[var(--sniptale-color-border-soft)] px-2 py-1
          text-[10px] font-semibold uppercase tracking-[0.12em]
          text-[var(--sniptale-color-text-muted)]"
      >
        {translate('scenario.editor.navigator')}
      </div>
    </div>
  );
}

function ScenarioSlideNavigatorDefaultView(props: {
  controller: ScenarioSlideNavigatorController;
  dragStepId: string | null;
  onSetDragStepId: (stepId: string | null) => void;
  project: ScenarioSlideNavigatorController['project']['project'];
  thumbnailUrls: Record<string, string>;
}) {
  return (
    <div className="grid min-h-0 gap-3 p-3">
      <div
        className="w-fit rounded-full border border-[var(--sniptale-color-border-soft)] px-2.5 py-1
          text-[10px] font-semibold uppercase tracking-[0.12em]
          text-[var(--sniptale-color-text-muted)]"
      >
        {translate('scenario.editor.navigator')}
      </div>
      <ScenarioNavigatorPanelContent
        controller={props.controller}
        dragStepId={props.dragStepId}
        onSetDragStepId={props.onSetDragStepId}
        project={props.project}
        thumbnailUrls={props.thumbnailUrls}
      />
    </div>
  );
}

export function ScenarioSlideNavigator(props: { controller: ScenarioSlideNavigatorController }) {
  const [dragStepId, setDragStepId] = useState<string | null>(null);
  const project = props.controller.project.project;
  const projectSteps = project?.steps ?? EMPTY_SCENARIO_STEPS;
  const previewSteps = useMemo(
    () => [...projectSteps, ...(project?.trash.map((entry) => entry.step) ?? EMPTY_SCENARIO_STEPS)],
    [project, projectSteps]
  );
  const thumbnailUrls = useScenarioNavigatorThumbnails(previewSteps);

  return (
    <InspectorShellFrame
      collapsed={props.controller.ui.navigatorCollapsed}
      expandedWidthClassName={SCENARIO_EDITOR_NAVIGATOR_EXPANDED_WIDTH_CLASS}
      collapsedWidthClassName={SCENARIO_EDITOR_NAVIGATOR_COLLAPSED_WIDTH_CLASS}
      dataUi="scenario.editor.slide-navigator.frame"
    >
      <InspectorShellPanel dataUi="scenario.editor.slide-navigator.panel">
        {props.controller.ui.navigatorCollapsed ? (
          <ScenarioSlideNavigatorCollapsedRail />
        ) : props.controller.ui.leftPanelMode === 'projects' ? (
          <ScenarioSlideNavigatorProjectsView controller={props.controller} />
        ) : props.controller.ui.leftPanelMode === 'ai-editor' ? (
          <ScenarioSlideNavigatorAiEditorView controller={props.controller} />
        ) : (
          <ScenarioSlideNavigatorDefaultView
            controller={props.controller}
            dragStepId={dragStepId}
            onSetDragStepId={setDragStepId}
            project={project}
            thumbnailUrls={thumbnailUrls}
          />
        )}
      </InspectorShellPanel>
    </InspectorShellFrame>
  );
}
