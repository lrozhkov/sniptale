import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { getSelectionFrameVisual } from '../../frame-runtime/selection-frame-visual';
import { createSelectionModeEventHandlers } from '../events/handlers';
import { createSelectionModeEventsBridge } from '../events/bridge';
import { setupSelectionModeRuntimeListeners } from '../events/listeners/runtime';
import { disableSelectionModeCursor, enableSelectionModeCursor } from '../interaction/cursor';
import {
  disableSelectionModeApi,
  enableSelectionModeApi,
  isSelectionModeActiveApi,
} from '../public-api';
import type { SelectionModeSession } from '../session';
import { createSelectionModeUiRuntime } from '../ui/runtime';
import { createSelectionModeSizePanelSetup } from '../ui/size-panel/runtime';
import {
  getMaxSelectionHeight,
  getMaxSelectionWidth,
  MIN_SELECTION_SIZE,
  OVERLAY_BACKGROUND,
  Z_INDEX_BASE,
} from '../constants';
import { createSelectionModeRuntimeSetup } from './setup';

type SelectionModeEvents = ReturnType<typeof createSelectionModeEventsBridge>;
type SelectionModeHandlers = ReturnType<typeof createSelectionModeEventHandlers>;

export interface SelectionModeRuntime {
  cleanupEffects: () => void;
  disableSelectionMode: () => void;
  enableSelectionMode: () => Promise<CaptureArea>;
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
    getDom: () => args.session.dom,
    getVisual: () => visual,
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    minSelectionSize: MIN_SELECTION_SIZE,
    onCancel: () => getEvents().cancelSelection(),
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
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    handleClick: (event, iframe) => getHandlers().handleClick(event, iframe),
    handleKeyDown: (event) => getHandlers().handleKeyDown(event),
    handleMouseDown: (event, iframe) => getHandlers().handleMouseDown(event, iframe),
    handleMouseLeave: () => getHandlers().handleMouseLeave(),
    handleMouseMove: (event, iframe) => getHandlers().handleMouseMove(event, iframe),
    handleMouseUp: () => getHandlers().handleMouseUp(),
    minSelectionSize: MIN_SELECTION_SIZE,
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
    enableSelectionMode: () =>
      enableSelectionModeApi({
        cleanup: args.cleanup,
        createHoverElements: () => uiRuntime.createHoverElements(),
        createOverlayContainer: () => uiRuntime.createOverlayContainer(),
        enableCursor: () => enableSelectionModeCursor(args.session),
        prepareUi: () => uiRuntime.prepare(),
        session: args.session,
        setupEventListeners: () => setupSelectionModeRuntimeListeners(runtimeArgs),
      }),
    isSelectionModeActive: () => isSelectionModeActiveApi(args.session.isActive),
  };
}
