import {
  deactivateOtherContentModes,
  setContentModeEnabled,
} from '../../../../application/mode-session';
import { parsePageSnapshotAfterIframePreflight } from '../../../../parser/dom-tree-parser/snapshot';
import {
  createAiPickModeDisabler,
  createEnableAiPickMode,
  createRefreshAiPickSnapshot,
} from './mode.enable';
import { createMouseLeaveHandler, createMouseMoveHandler } from './mode.handlers/hover';
import { createKeyDownHandler } from './mode.handlers/keyboard';
import { createClickHandler, createPointerDownHandler } from './mode.handlers/selection';
import { createAiPickModeState } from './mode.state';
import type { AiPickModeController, AiPickModeControllerDeps } from './mode.types';

export function createAiPickModeController(deps: AiPickModeControllerDeps): AiPickModeController {
  const deactivateOtherModes = deps.deactivateOtherModes ?? deactivateOtherContentModes;
  const parseDomTree = deps.parseDomTree ?? parsePageSnapshotAfterIframePreflight;
  const setModeEnabled = deps.setContentModeEnabled ?? setContentModeEnabled;
  const state = createAiPickModeState();
  const disable = createAiPickModeDisabler(state, deps.overlayController);
  const handleMouseLeave = createMouseLeaveHandler(state, deps.overlayController);
  const handleMouseMove = createMouseMoveHandler(state, deps.overlayController);
  const handlePointerDown = createPointerDownHandler(state);
  const handleClick = createClickHandler(state);
  const handleKeyDown = createKeyDownHandler(state, disable);

  return {
    enable: createEnableAiPickMode({
      deactivateOtherModes,
      handleClick,
      handleKeyDown,
      handleMouseLeave,
      handleMouseMove,
      handlePointerDown,
      overlayController: deps.overlayController,
      parseDomTree,
      setModeEnabled,
      state,
    }),
    refreshSnapshot: createRefreshAiPickSnapshot(state, parseDomTree),
    disable,
    isEnabled: () => state.isEnabled,
  };
}
