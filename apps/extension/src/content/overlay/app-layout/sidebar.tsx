import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { translate } from '../../../platform/i18n';
import { createTrustedContentActionIntentSource } from '../../application/privileged-action-intent';
import { showScreenshotError } from '../screenshot/feedback';
import { ScenarioRecorderSidebar } from '../scenario-recorder/sidebar';
import { useScenarioRecorderSidebarPosition } from '../scenario-recorder/sidebar/position';
import { exitScreenshotModeFromUserAction, finishScenarioRecorder } from './scenario';
import { useDeferredSidebarHighlight } from './sidebar-highlight';
import { shouldRenderContentScenarioRecorderSidebar } from './sidebar-visibility';
import { queryContentUiElement } from '../../platform/dom-host';
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
      await args.handleTakeScreenshot('visible', source, { captureAction: 'scenario' });
    } catch (error) {
      showScreenshotError(error);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, captureVisible };
}

function useSidebarFinish(args: ContentScenarioRecorderSidebarArgs, captureBusy: boolean) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  async function finish() {
    if (pending.current || captureBusy || args.captureSuspended) return;
    pending.current = true;
    setBusy(true);
    try {
      await finishScenarioRecorder({
        onDisableScreenshotMode: () =>
          exitScreenshotModeFromUserAction({
            modeController: args.modeController,
            setPinToTab: args.setPinToTab,
            keepPinnedForAutoBlur: args.keepPinnedForAutoBlur,
          }),
        scenarioController: args.scenario.actions,
      });
    } catch {
      showToast(translate('scenario.content.finishError'), 'error');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, finish };
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
  const finish = useSidebarFinish({ ...args, captureSuspended }, capture.busy);
  const isHidden = !shouldRenderContentScenarioRecorderSidebar(args) || captureSuspended;
  const focusRestorePending = useRef(false);
  const sidebarPosition = useScenarioRecorderSidebarPosition(
    !isHidden && args.scenario.state.sidebarVisible
  );

  useEffect(() => {
    if (isHidden || args.scenario.state.sidebarVisible || !focusRestorePending.current) return;
    const target = queryContentUiElement<HTMLButtonElement>(
      '[data-ui="content.scenario.sidebar.restore"]'
    );
    if (target) {
      target.focus();
      focusRestorePending.current = false;
    }
  }, [args.scenario.state.sidebarVisible, isHidden]);

  if (isHidden || !args.scenario.state.sidebarVisible) {
    return null;
  }

  return (
    <ScenarioRecorderSidebar
      onCaptureVisible={capture.captureVisible}
      captureBusy={capture.busy || finish.busy}
      onCollapse={(event) => {
        if (event.detail === 0) focusRestorePending.current = true;
        args.scenario.actions.setSidebarVisible(false);
      }}
      onClose={async (event) => {
        const restoreFocus = event.detail === 0;
        if (!(await args.scenario.actions.setRecorderPanelVisible(false))) return;
        focusRestorePending.current = false;
        if (restoreFocus) {
          queryContentUiElement<HTMLButtonElement>(
            '[data-ui="content.toolbar.scenario-panel-button"]'
          )?.focus();
        }
      }}
      highlightToken={args.scenario.state.recentStepHighlightToken}
      forcedHighlightStepId={forcedHighlightStepId}
      forcedHighlightVersion={forcedHighlightVersion}
      onDeleteStep={(stepId) => void args.scenario.actions.deleteRecentStep(stepId)}
      onFinish={() => void finish.finish()}
      finishBusy={finish.busy}
      onMoveStep={(stepId, toIndex) => void args.scenario.actions.moveRecentStep(stepId, toIndex)}
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
