import { pageCapturePreferences } from '../../../application/capture-preferences';
import { mountFrozenSelectionFrame, watchFrozenSelectionViewport } from '../frozen';
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
import { createSelectionDrawingRuntime } from '../ui/drawing';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentSelectionMode' });

function createCropModePreferences() {
  let pendingMutation = Promise.resolve();
  return {
    save(drawing: boolean): void {
      pendingMutation = patchSettings({
        contentToolbar: { cropMode: drawing ? 'drawing' : 'resize' },
      }).then(
        () => undefined,
        (error) => {
          logger.error('Failed to save Crop mode preference', error);
        }
      );
    },
    prepare(prepareUi: () => Promise<void>) {
      let initialDrawing = true;
      return {
        get initialDrawing() {
          return initialDrawing;
        },
        prepare: async () => {
          await prepareUi();
          await pendingMutation;
          try {
            initialDrawing = (await loadSettings()).contentToolbar?.cropMode !== 'resize';
          } catch {
            initialDrawing = true;
          }
        },
      };
    },
  };
}

type SelectionModeEvents = ReturnType<typeof createSelectionModeEventsBridge>;
type SelectionModeHandlers = ReturnType<typeof createSelectionModeEventHandlers>;

export interface SelectionModeRuntime {
  cleanupEffects: () => void;
  disableSelectionMode: () => void;
  enableSelectionMode: (options?: SelectionModeActivationOptions) => Promise<CaptureArea>;
  isSelectionModeActive: () => boolean;
}

interface SelectionModeRuntimeArgs {
  cleanup: () => void;
  session: SelectionModeSession;
}

function watchSelectionModeFrozenViewport(
  session: SelectionModeSession,
  onChanged: () => void
): void {
  if (!session.frozenFrame) return;
  const cleanup = session.cleanupEventListeners;
  const stopWatching = watchFrozenSelectionViewport(session.frozenFrame.geometry, onChanged);
  session.cleanupEventListeners = () => {
    stopWatching();
    cleanup?.();
  };
}

function createSelectionCaptureOptions(): Pick<
  Parameters<typeof createSelectionModeUiRuntime>[0],
  'getCapturePreferences' | 'onImageFormatChange' | 'prepareVisual'
> {
  let compactMenus = false;
  return {
    getCapturePreferences: () => ({ ...pageCapturePreferences.read('selection'), compactMenus }),
    onImageFormatChange: (imageFormat) =>
      pageCapturePreferences.update('selection', { imageFormat }),
    prepareVisual: async () => {
      await pageCapturePreferences.load().catch(() => undefined);
      compactMenus = await loadSettings()
        .then((settings) => settings.contentToolbar?.compactMenus ?? false)
        .catch(() => false);
    },
  };
}

export function createSelectionModeRuntime(args: SelectionModeRuntimeArgs): SelectionModeRuntime {
  let events: SelectionModeEvents;
  let handlers: SelectionModeHandlers;
  let drawing: ReturnType<typeof createSelectionDrawingRuntime> | null = null;
  let publishDrawingSnapshot: SelectionModeActivationOptions['onDrawingSnapshot'];
  const cropModePreferences = createCropModePreferences();

  const getEvents = () => events;
  const getHandlers = () => (drawing?.isDrawing() ? null : handlers);
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
    ...createSelectionCaptureOptions(),
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
    onConfirm: (event) => getEvents().confirmSelection(event),
    onResetToIdle: () => getEvents().resetToIdleState(),
    onSetupSizePanelListeners: setupSizePanelListeners,
    overlayBackground: OVERLAY_BACKGROUND,

    zIndexBase: Z_INDEX_BASE,
  });
  const runtimeArgs = createSelectionModeRuntimeSetup({
    createDragFrame: () => uiRuntime.createDragFrame(),
    createFinalElements: () => {
      uiRuntime.createFinalElements();
      if (args.session.dom.finalOverlay) args.session.dom.finalOverlay.style.zIndex = '3';
      if (args.session.dom.sizeTooltip) drawing?.attachToolbar(args.session.dom.sizeTooltip);
    },
    flushFinalFrameUpdate: () => flushScheduledFinalFrameUpdate(args.session.dom),
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    handleClick: (event, iframe) => getHandlers()?.handleClick(event, iframe),
    handleDragStart: (event) => getHandlers()?.handleDragStart(event),
    handleKeyDown: (event) => getHandlers()?.handleKeyDown(event),
    handleMouseDown: (event, iframe) => getHandlers()?.handleMouseDown(event, iframe),
    handleMouseLeave: () => getHandlers()?.handleMouseLeave(),
    handleMouseMove: (event, iframe) => getHandlers()?.handleMouseMove(event, iframe),
    handleMouseUp: (event) => getHandlers()?.handleMouseUp(event),
    minSelectionSize: MIN_SELECTION_SIZE,
    scheduleFinalFrameUpdate: () =>
      scheduleFinalFrameUpdate(args.session.dom, args.session.currentSelection),
    session: args.session,
    updateFinalFrame: () => getEvents().updateFinalFrame(),
    zIndexBase: Z_INDEX_BASE,
  });

  const eventBridge = createSelectionModeEventsBridge({
    cleanupEvent: args.cleanup,
    disableCursor: () => disableSelectionModeCursor(args.session),
    handleKeyDown: (event) => getHandlers()?.handleKeyDown(event),
    runtimeArgs,
  });
  events = {
    ...eventBridge,
    confirmSelection: (event?: Event) => {
      const snapshot = drawing?.finalize();
      if (snapshot) publishDrawingSnapshot?.(snapshot);
      eventBridge.confirmSelection(event);
    },
  };
  handlers = createSelectionModeEventHandlers({
    selectionModeEvents: events,
    state: runtimeArgs.state,
  });

  return {
    cleanupEffects: () => {
      try {
        drawing?.dispose();
      } finally {
        drawing = null;
        publishDrawingSnapshot = undefined;
        events.cleanup();
      }
    },
    disableSelectionMode: () =>
      disableSelectionModeApi({ cleanup: args.cleanup, session: args.session }),
    enableSelectionMode: (options) => {
      const preparation = cropModePreferences.prepare(uiRuntime.prepare);
      return enableSelectionModeApi({
        cleanup: args.cleanup,
        createHoverElements: () => uiRuntime.createHoverElements(),
        createOverlayContainer: () => {
          uiRuntime.createOverlayContainer();
          if (args.session.frozenFrame) {
            mountFrozenSelectionFrame(args.session.dom.overlayContainer, args.session.frozenFrame);
          }
          const container = args.session.dom.overlayContainer;
          if (container) {
            publishDrawingSnapshot = options?.onDrawingSnapshot;
            drawing = createSelectionDrawingRuntime({
              container,
              initialDrawing: preparation.initialDrawing,
              onModeChange: cropModePreferences.save,
              onLayout: () => getEvents().updateFinalFrame(),
            });
          }
        },
        enableCursor: () => enableSelectionModeCursor(args.session),
        prepareUi: preparation.prepare,
        ...(options === undefined ? {} : { options }),
        session: args.session,
        setupEventListeners: () => {
          setupSelectionModeRuntimeListeners({
            hideHoverFrame: runtimeArgs.hideHoverFrame,
            session: args.session,
            setupListenerHandlers: runtimeArgs.setupListenerHandlers,
          });
          watchSelectionModeFrozenViewport(args.session, () => getEvents().cancelSelection());
        },
      });
    },
    isSelectionModeActive: () => isSelectionModeActiveApi(args.session.isActive),
  };
}
