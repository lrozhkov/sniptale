import {
  disableNavigationLock,
  disableTextSelectionBlock,
  enableNavigationLock,
  enableTextSelectionBlock,
  isLockEnabled,
} from '../../../../../selection/locker';
import { setContentModeEnabled } from '../../../../../application/mode-session';
import { addEventListenerToAllWindowsDynamic } from '../../../../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { buildElementMaps } from '../dom-helpers';
import { resetAiPickElementIndex } from '../dom-index';
import type { AiPickSourceAdapter } from '../source.types';
import { applyAiPickCursorStyles } from './cursor';
import { applyAiPickDocumentMode } from './mode';
import { createAiPickDomState, type AiPickDomState } from './state';

const logger = createLogger({ namespace: 'ContentAiPick' });

export { createAiPickDomState, type AiPickDomState };

function resolveAiPickListenerRoot(source?: AiPickSourceAdapter | null) {
  return source
    ? {
        rootDocument: source.snapshotSource.document,
        rootIframe: source.targetIframe,
      }
    : undefined;
}

function addAiPickPointerListener<E extends Event>(
  eventType: string,
  handler: (event: E, iframe?: HTMLIFrameElement) => void,
  source?: AiPickSourceAdapter | null
): () => void {
  return addEventListenerToAllWindowsDynamic<E>(
    eventType,
    handler,
    { capture: true },
    resolveAiPickListenerRoot(source)
  );
}

export function setupAiPickDom(parsedTree: ParsedDOMTree | null, state: AiPickDomState): void {
  const stats = parsedTree
    ? buildElementMaps(state.elementIndex, parsedTree)
    : { elementCount: 0, dataCount: 0 };
  logger.debug('Built AI pick element maps', {
    elementsWithData: stats.elementCount,
    dataIds: stats.dataCount,
  });

  state.navigationLockEnabledBeforeSetup = isLockEnabled();
  enableNavigationLock(true);
  enableTextSelectionBlock();
  applyAiPickDocumentMode(true);
  applyAiPickCursorStyles(state);
}

export function refreshAiPickDomSnapshot(
  parsedTree: ParsedDOMTree | null,
  state: AiPickDomState
): void {
  const stats = parsedTree
    ? buildElementMaps(state.elementIndex, parsedTree)
    : { elementCount: 0, dataCount: 0 };
  logger.debug('Refreshed AI pick element maps', {
    elementsWithData: stats.elementCount,
    dataIds: stats.dataCount,
  });
}

export function attachAiPickListeners(
  state: AiPickDomState,
  handleMouseMove: (event: MouseEvent) => void,
  handlePointerDown: (event: MouseEvent) => void,
  handleClick: (event: MouseEvent) => void,
  handleKeyDown: (event: KeyboardEvent) => void,
  handleMouseLeave: () => void,
  source?: AiPickSourceAdapter | null
): void {
  const cleanupMouseMove = addAiPickPointerListener('mousemove', handleMouseMove, source);
  const cleanupPointerDown = addAiPickPointerListener('pointerdown', handlePointerDown, source);
  const cleanupClick = addAiPickPointerListener('click', handleClick, source);
  const cleanupKeyDown = addAiPickPointerListener('keydown', handleKeyDown, source);

  const mouseLeaveDocument = source?.snapshotSource.document ?? document;
  mouseLeaveDocument.addEventListener('mouseleave', handleMouseLeave);

  state.cleanupEventListeners = () => {
    cleanupMouseMove();
    cleanupPointerDown();
    cleanupClick();
    cleanupKeyDown();
    mouseLeaveDocument.removeEventListener('mouseleave', handleMouseLeave);
  };
}

export function teardownAiPickDom(state: AiPickDomState): void {
  resetAiPickElementIndex(state.elementIndex);

  if (state.cleanupEventListeners) {
    state.cleanupEventListeners();
    state.cleanupEventListeners = null;
  }

  applyAiPickDocumentMode(false);

  state.cleanupCursorStyles?.();
  state.cleanupCursorStyles = null;
  state.cursorStyleElement?.remove();
  state.cursorStyleElement = null;

  disableTextSelectionBlock();
  if (state.navigationLockEnabledBeforeSetup) {
    enableNavigationLock(false);
  } else {
    disableNavigationLock();
  }
  state.navigationLockEnabledBeforeSetup = null;
  setContentModeEnabled('ai-pick', false);
}
