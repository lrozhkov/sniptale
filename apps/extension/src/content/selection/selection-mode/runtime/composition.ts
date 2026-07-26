import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { getSelectionFrameVisual } from '../../frame-runtime/selection-frame-visual';
import { createSelectionModeEventHandlers } from '../events/handlers';
import { createSelectionModeEventsBridge } from '../events/bridge';
import { setupSelectionModeRuntimeListeners } from '../events/listeners';
import { disableSelectionModeCursor, enableSelectionModeCursor } from '../interaction/cursor';
import {
  disableSelectionModeApi,
  enableSelectionModeApi,
  isSelectionModeActiveApi,
} from '../public-api';
import type { SelectionModeSession } from '../session';
import type { SelectionModeActivationOptions } from '../types';
import { createSelectionModeUiRuntime } from '../ui/runtime';
import { flushScheduledFinalFrameUpdate, scheduleFinalFrameUpdate } from '../ui/frame-updates';
import { createSelectionModeSizePanelSetup } from '../ui/size-panel/runtime';
import {
  getMaxSelectionHeight,
  getMaxSelectionWidth,
  MIN_SELECTION_SIZE,
  OVERLAY_BACKGROUND,
  Z_INDEX_BASE,
} from '../constants';
import { createSelectionModeRuntimeSetup } from './setup';
import { adjustSelectionPadding } from '../interaction/selection/padding';

type SelectionModeEvents = ReturnType<typeof createSelectionModeEventsBridge>;
type SelectionModeHandlers = ReturnType<typeof createSelectionModeEventHandlers>;

export interface SelectionModeRuntime {
  cleanupEffects: () => void;
  disableSelectionMode: () => void;
  enableSelectionMode: (options?: SelectionModeActivationOptions) => Promise<CaptureArea>;
  isSelectionModeActive: () => boolean;
}

export function createSelectionModeRuntime(args: {
  cleanup: () => void;
  session: SelectionModeSession;
}): SelectionModeRuntime {
  let events: SelectionModeEvents;
  let handlers: SelectionModeHandlers;

  const getEvents = () => events;
  const getHandlers = () => handlers;
  const visual = getSelectionFrameVisual();
  const setupSizePanelListeners = createSelectionModeSizePanelSetup({
    constrainSelection: () => getEvents().constrainSelection(),
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    session: args.session,
    updateFinalFrame: () => getEvents().updateFinalFrame(),
  });
  const uiRuntime = createSelectionModeUiRuntime({
    getCaptureAction: () => args.session.captureAction,
    getDom: () => args.session.dom,
    getSelection: () => args.session.currentSelection,
    getVisual: () => visual,
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    minSelectionSize: MIN_SELECTION_SIZE,
    onCancel: () => getEvents().cancelSelection(),
    onAdjustPadding: (direction) => {
      args.session.currentSelection = adjustSelectionPadding(
        args.session.currentSelection,
        direction,
        { width: getMaxSelectionWidth(), height: getMaxSelectionHeight() }
      );
      getEvents().updateFinalFrame();
    },
    onCaptureActionChange: (action) => {
      args.session.captureAction = action;
      args.session.onCaptureActionChange?.(action);
    },
    onConfirm: () => getEvents().confirmSelection(),
    onResetToIdle: () => getEvents().resetToIdleState(),
    onSetupSizePanelListeners: setupSizePanelListeners,
    overlayBackground: OVERLAY_BACKGROUND,
    prepareVisual: async () => {},
    zIndexBase: Z_INDEX_BASE,
  });
  const runtimeArgs = createSelectionModeRuntimeSetup({
    createDragFrame: () => uiRuntime.createDragFrame(),
    createFinalElements: () => uiRuntime.createFinalElements(),
    flushFinalFrameUpdate: () => flushScheduledFinalFrameUpdate(args.session.dom),
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    handleClick: (event, iframe) => getHandlers().handleClick(event, iframe),
    handleKeyDown: (event) => getHandlers().handleKeyDown(event),
    handleMouseDown: (event, iframe) => getHandlers().handleMouseDown(event, iframe),
    handleMouseLeave: () => getHandlers().handleMouseLeave(),
    handleMouseMove: (event, iframe) => getHandlers().handleMouseMove(event, iframe),
    handleMouseUp: (event) => getHandlers().handleMouseUp(event),
    minSelectionSize: MIN_SELECTION_SIZE,
    scheduleFinalFrameUpdate: () =>
      scheduleFinalFrameUpdate(args.session.dom, args.session.currentSelection),
    session: args.session,
    updateFinalFrame: () => getEvents().updateFinalFrame(),
    zIndexBase: Z_INDEX_BASE,
  });

  events = createSelectionModeEventsBridge({
    cleanupEvent: args.cleanup,
    disableCursor: () => disableSelectionModeCursor(args.session),
    handleKeyDown: (event) => getHandlers().handleKeyDown(event),
    runtimeArgs,
  });
  handlers = createSelectionModeEventHandlers({
    selectionModeEvents: events,
    state: runtimeArgs.state,
  });

  return {
    cleanupEffects: events.cleanup,
    disableSelectionMode: () =>
      disableSelectionModeApi({ cleanup: args.cleanup, session: args.session }),
    enableSelectionMode: (options) =>
      enableSelectionModeApi({
        cleanup: args.cleanup,
        createHoverElements: () => uiRuntime.createHoverElements(),
        createOverlayContainer: () => uiRuntime.createOverlayContainer(),
        enableCursor: () => enableSelectionModeCursor(args.session),
        prepareUi: () => uiRuntime.prepare(),
        ...(options === undefined ? {} : { options }),
        session: args.session,
        setupEventListeners: () =>
          setupSelectionModeRuntimeListeners({
            hideHoverFrame: runtimeArgs.hideHoverFrame,
            session: args.session,
            setupListenerHandlers: runtimeArgs.setupListenerHandlers,
          }),
      }),
    isSelectionModeActive: () => isSelectionModeActiveApi(args.session.isActive),
  };
}
