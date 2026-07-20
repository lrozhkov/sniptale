import { disableAiPickModeIfLoaded } from '../../ai/pick/runtime/lazy';
import type { InteractiveFrameComponent } from '../../../selection/frame-runtime/roots/component';
import type { ContentAppViewModel } from './types';
import { useContentAppModeState } from '../mode';
import { useAutoBlurController } from '../../auto-blur/controller';
import { useContentAppBindings } from '../bindings';
import { useContentAppControllers } from '../controllers';
import {
  buildContentModeControls,
  buildContentModeFlags,
  buildContentQuickActionState,
  buildContentVisibilityState,
  buildContentViewportState,
  type ContentRuntimeBridgeParams,
} from './helpers';
import { useContentRuntimeBridge } from '../message-bridge/react';

function disableAiPickModeDeferred() {
  disableAiPickModeIfLoaded();
}

export function useContentAppViewModel(params: {
  InteractiveFrameComponent: InteractiveFrameComponent;
  preloadAIModal: () => Promise<void>;
}): ContentAppViewModel {
  const modeState = useContentAppModeState();
  const controllers = useContentAppControllers(modeState, {
    preloadAIModal: params.preloadAIModal,
  });
  const modeControls = buildContentModeControls(modeState);
  const modeFlags = buildContentModeFlags(modeState);
  const visibilityState = buildContentVisibilityState(modeState);
  const runtimeBridgeParams: ContentRuntimeBridgeParams = {
    handleTakeScreenshot: controllers.screenshotController.handleTakeScreenshot,
    invalidateScreenshotRuns: controllers.screenshotController.invalidateScreenshotRuns,
    modeControls,
    modeFlags,
    quickActionState: buildContentQuickActionState(modeState),
    visibilityState,
    viewportState: buildContentViewportState(modeState),
  };
  const frameManager = useContentAppBindings({
    countdownActive: controllers.screenshotController.countdown !== null,
    InteractiveFrameComponent: params.InteractiveFrameComponent,
    modeControls,
    modeFlags,
    visibilityState,
  });
  const autoBlurController = useAutoBlurController({
    autoApplyAllowed: modeState.pinToTab || controllers.scenarioController.scenarioEnabled,
    frameManager,
    highlighterMode: modeState.highlighterMode,
  });

  useContentRuntimeBridge(runtimeBridgeParams, disableAiPickModeDeferred);

  return buildContentAppViewModel({
    ...controllers,
    autoBlurController,
    frameManager,
    modeState,
  });
}

function buildContentAppViewModel(viewModel: ContentAppViewModel): ContentAppViewModel {
  return viewModel;
}
