import { createLogger } from '@sniptale/platform/observability/logger';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import {
  attachAiPickListeners,
  refreshAiPickDomSnapshot,
  setupAiPickDom,
  teardownAiPickDom,
} from './dom-state';
import type {
  deactivateOtherContentModes,
  setContentModeEnabled,
} from '../../../../application/mode-session';
import type {
  AiPickEnableOptions,
  AiPickListenerHandlers,
  AiPickModeControllerDeps,
  AiPickModeState,
  AiPickSelectionCallback,
  AiPickSourceAdapter,
} from './mode.types';
import type { AiPickOverlayController } from './overlay';
import type { parsePageSnapshotAfterIframePreflight } from '../../../../parser/dom-tree-parser/snapshot';

const logger = createLogger({ namespace: 'ContentAiPick' });

function finalizeAiPickEnable(
  state: AiPickModeState,
  onContentSelect: AiPickSelectionCallback,
  nextParsedTree: ParsedDOMTree
): void {
  state.parsedTree = nextParsedTree;
  if (nextParsedTree.structure.length === 0) {
    logger.warn('Enabled AI pick mode on a page without parsable data');
  }

  state.isEnabled = true;
  state.onContentSelect = onContentSelect;
  setupAiPickDom(nextParsedTree, state.domState);
}

function resolveAiPickSource(options?: AiPickEnableOptions): AiPickSourceAdapter | null {
  if (!options?.source) {
    return null;
  }

  const source = options.source();
  if (!source) {
    throw new Error('AI pick source is unavailable.');
  }

  return source;
}

function attachEnabledAiPickListeners(
  props: AiPickListenerHandlers & { state: AiPickModeState },
  source: AiPickSourceAdapter | null
): void {
  attachAiPickListeners(
    props.state.domState,
    props.handleMouseMove,
    props.handlePointerDown,
    props.handleClick,
    props.handleKeyDown,
    props.handleMouseLeave,
    source
  );
}

export function createAiPickModeDisabler(
  state: AiPickModeState,
  overlayController: Pick<AiPickOverlayController, 'hideHoverOverlay' | 'removeOverlayContainer'>
) {
  return () => {
    state.enableSequence += 1;

    if (!state.isEnabled && !state.pendingEnable) {
      logger.debug('AI pick mode already disabled');
      return;
    }

    logger.log('Disabling AI pick mode');
    state.pendingEnable = null;
    state.isEnabled = false;
    state.onContentSelect = null;
    state.parsedTree = null;
    state.source = null;
    teardownAiPickDom(state.domState);
    overlayController.hideHoverOverlay();
    overlayController.removeOverlayContainer();
    logger.debug('AI pick mode disabled');
  };
}

export function createEnableAiPickMode(props: {
  deactivateOtherModes: typeof deactivateOtherContentModes;
  handleClick: AiPickListenerHandlers['handleClick'];
  handleKeyDown: AiPickListenerHandlers['handleKeyDown'];
  handleMouseLeave: AiPickListenerHandlers['handleMouseLeave'];
  handleMouseMove: AiPickListenerHandlers['handleMouseMove'];
  handlePointerDown: AiPickListenerHandlers['handlePointerDown'];
  overlayController: AiPickModeControllerDeps['overlayController'];
  parseDomTree: typeof parsePageSnapshotAfterIframePreflight;
  setModeEnabled: typeof setContentModeEnabled;
  state: AiPickModeState;
}) {
  return async (onContentSelect: AiPickSelectionCallback, options?: AiPickEnableOptions) => {
    if (props.state.isEnabled) {
      logger.debug('AI pick mode already enabled');
      return;
    }

    if (props.state.pendingEnable) {
      return props.state.pendingEnable;
    }

    logger.log('Enabling AI pick mode');
    const enableSequence = ++props.state.enableSequence;

    props.state.pendingEnable = (async () => {
      const source = resolveAiPickSource(options);
      props.state.source = source;
      const nextParsedTree = await props.parseDomTree('ai-pick', source?.snapshotSource);
      if (enableSequence !== props.state.enableSequence) {
        return;
      }

      props.deactivateOtherModes('ai-pick');
      finalizeAiPickEnable(props.state, onContentSelect, nextParsedTree);
      props.overlayController.createOverlayContainer();
      props.overlayController.createHoverOverlay();
      attachEnabledAiPickListeners(props, source);
      props.setModeEnabled('ai-pick', true);
      logger.debug('AI pick mode enabled');
    })();

    try {
      await props.state.pendingEnable;
    } finally {
      props.state.pendingEnable = null;
    }
  };
}

export function createRefreshAiPickSnapshot(
  state: AiPickModeState,
  parseDomTree: typeof parsePageSnapshotAfterIframePreflight
) {
  return async () => {
    if (!state.isEnabled) {
      return;
    }

    const refreshSequence = state.enableSequence;
    const nextParsedTree = await parseDomTree('ai-pick-refresh', state.source?.snapshotSource);
    if (!state.isEnabled || refreshSequence !== state.enableSequence) {
      return;
    }

    state.parsedTree = nextParsedTree;
    refreshAiPickDomSnapshot(nextParsedTree, state.domState);
  };
}
