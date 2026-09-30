import { ScenarioRecorderSidebar } from '../scenario-recorder/sidebar';
import { useScenarioRecorderSidebarPosition } from '../scenario-recorder/sidebar/position';
import { exitScreenshotModeFromUserAction, finishScenarioRecorder } from './scenario';
import { useDeferredSidebarHighlight } from './sidebar-highlight';
import { shouldRenderContentScenarioRecorderSidebar } from './sidebar-visibility';
import type { ContentAppLayoutScenarioProps, ContentAppModeController } from './types';

type ContentScenarioRecorderSidebarArgs = {
  isCompletelyHidden: boolean;
  isToolbarVisible: boolean;
  byClickDisabled: boolean;
  modeController: Pick<ContentAppModeController, 'handleToggleScreenshotMode'>;
  scenario: ContentAppLayoutScenarioProps;
  setPinToTab: (value: boolean) => void;
  keepPinnedForAutoBlur: boolean;
};

export function ContentScenarioRecorderSidebar(args: ContentScenarioRecorderSidebarArgs) {
  const { forcedHighlightStepId, forcedHighlightVersion } = useDeferredSidebarHighlight(args);
  const isHidden = !shouldRenderContentScenarioRecorderSidebar(args);
  const sidebarPosition = useScenarioRecorderSidebarPosition(!isHidden);

  if (isHidden) {
    return null;
  }

  return (
    <ScenarioRecorderSidebar
      highlightToken={args.scenario.state.recentStepHighlightToken}
      forcedHighlightStepId={forcedHighlightStepId}
      forcedHighlightVersion={forcedHighlightVersion}
      onDeleteStep={(stepId) => void args.scenario.actions.deleteRecentStep(stepId)}
      onFinish={() =>
        void finishScenarioRecorder({
          onDisableScreenshotMode: () =>
            exitScreenshotModeFromUserAction({
              modeController: args.modeController,
              setPinToTab: args.setPinToTab,
              keepPinnedForAutoBlur: args.keepPinnedForAutoBlur,
            }),
          scenarioController: args.scenario.actions,
        })
      }
      onMoveStep={(stepId, toIndex) => void args.scenario.actions.moveRecentStep(stepId, toIndex)}
      onOpenEditor={(stepId) => void args.scenario.actions.openEditor(stepId)}
      onSidebarHeaderMouseDown={sidebarPosition.handleHeaderMouseDown}
      captureMode={args.scenario.state.scenarioCaptureMode}
      byClickDisabled={args.byClickDisabled}
      onSetCaptureMode={args.scenario.actions.setCaptureMode}
      onCreateProject={args.scenario.actions.createProject}
      onProjectSelect={args.scenario.actions.selectProject}
      projectId={args.scenario.state.scenarioProjectId}
      pendingProjectSelection={args.scenario.state.pendingProjectSelection}
      projects={args.scenario.state.projects}
      projectName={args.scenario.state.scenarioProjectName}
      position={sidebarPosition.position}
      uiScale={sidebarPosition.uiScale}
      recentSteps={args.scenario.state.recentSteps}
      sidebarRef={sidebarPosition.sidebarRef}
      dragging={sidebarPosition.isDragging}
    />
  );
}
