import { FileStack } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { translate } from '../../../platform/i18n';
import { createTrustedContentActionIntentSource } from '../../application/privileged-action-intent';
import { showScreenshotError } from '../screenshot/feedback';
import { ScenarioRecorderSidebar } from '../scenario-recorder/sidebar';
import { useScenarioRecorderSidebarPosition } from '../scenario-recorder/sidebar/position';
import { exitScreenshotModeFromUserAction, finishScenarioRecorder } from './scenario';
import { useDeferredSidebarHighlight } from './sidebar-highlight';
import { shouldRenderContentScenarioRecorderSidebar } from './sidebar-visibility';
import type {
  ContentAppLayoutScenarioProps,
  ContentAppModeController,
  ContentAppLayoutToolbarProps,
} from './types';

type ContentScenarioRecorderSidebarArgs = {
  isCompletelyHidden: boolean;
  isToolbarVisible: boolean;
  byClickDisabled: boolean;
  handleTakeScreenshot: ContentAppLayoutToolbarProps['handleTakeScreenshot'];
  captureSuspended?: boolean;
  modeController: Pick<ContentAppModeController, 'handleToggleScreenshotMode'>;
  scenario: ContentAppLayoutScenarioProps;
  setPinToTab: (value: boolean) => void;
  keepPinnedForAutoBlur: boolean;
};

function useSidebarCapture(args: ContentScenarioRecorderSidebarArgs) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  async function captureVisible(event: MouseEvent<HTMLButtonElement>) {
    if (pending.current || args.captureSuspended) return;
    const source = createTrustedContentActionIntentSource(event.nativeEvent);
    if (!source) return;
    pending.current = true;
    setBusy(true);
    try {
      await args.handleTakeScreenshot('visible', source);
    } catch (error) {
      showScreenshotError(error);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, captureVisible };
}

export function ContentScenarioRecorderSidebar(args: ContentScenarioRecorderSidebarArgs) {
  const { forcedHighlightStepId, forcedHighlightVersion } = useDeferredSidebarHighlight(args);
  const [countdownCapturePending, setCountdownCapturePending] = useState(false);
  useEffect(() => {
    if (args.captureSuspended) setCountdownCapturePending(true);
    else if (args.isToolbarVisible) setCountdownCapturePending(false);
  }, [args.captureSuspended, args.isToolbarVisible]);
  const captureSuspended = args.captureSuspended === true || countdownCapturePending;
  const capture = useSidebarCapture({ ...args, captureSuspended });
  const isHidden = !shouldRenderContentScenarioRecorderSidebar(args) || captureSuspended;
  const focusTarget = useRef<'panel' | 'restore' | null>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const sidebarPosition = useScenarioRecorderSidebarPosition(
    !isHidden && args.scenario.state.sidebarVisible
  );

  useEffect(() => {
    if (isHidden || !focusTarget.current) return;
    const target = args.scenario.state.sidebarVisible
      ? sidebarPosition.sidebarRef.current?.querySelector<HTMLButtonElement>(
          '[data-ui="content.scenario.sidebar.project-button"]'
        )
      : restoreButton.current;
    if (target) {
      target.focus();
      focusTarget.current = null;
    }
  }, [args.scenario.state.sidebarVisible, isHidden, sidebarPosition.sidebarRef]);

  if (isHidden) {
    return null;
  }

  if (!args.scenario.state.sidebarVisible) {
    return (
      <button
        type="button"
        ref={restoreButton}
        className="sniptale-show-toolbar-button"
        style={{ right: 'calc(76px * var(--sniptale-content-ui-scale))' }}
        data-ui="content.scenario.sidebar.restore"
        aria-label={translate('scenario.content.restorePanel')}
        title={translate('scenario.content.restorePanel')}
        onClick={(event) => {
          if (event.detail === 0) focusTarget.current = 'panel';
          args.scenario.actions.setSidebarVisible(true);
        }}
      >
        <FileStack aria-hidden="true" size={20} />
      </button>
    );
  }

  return (
    <ScenarioRecorderSidebar
      onCaptureVisible={capture.captureVisible}
      captureBusy={capture.busy}
      onCollapse={(event) => {
        if (event.detail === 0) focusTarget.current = 'restore';
        args.scenario.actions.setSidebarVisible(false);
      }}
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
