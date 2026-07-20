import { getContentEventTargetElement, isContentOwnedElement } from '../../platform/dom-host';
import { createLogger } from '@sniptale/platform/observability/logger';
import { routeLockInteractionEvent } from './routing';
import { isInteractiveElementForLock } from './helpers';

const logger = createLogger({ namespace: 'ContentLockerEvents' });

interface LockerInteractionState {
  isFullLockMode: boolean;
  isNavigationLocked: boolean;
  isUIHidden: boolean;
}

interface LockerKeyDownState extends LockerInteractionState {
  isInteractiveElement: (element: HTMLElement) => boolean;
}

export function handleLockerInteractionEvent(event: Event, state: LockerInteractionState): void {
  routeLockInteractionEvent(event, state);
}

export function handleLockerKeyDown(event: Event, state: LockerKeyDownState): void {
  const keyEvent = event as KeyboardEvent;

  if (state.isUIHidden) {
    logger.debug('UI hidden, skipping keyDown handler');
    return;
  }

  if (!state.isNavigationLocked) return;

  if (isRefreshShortcut(keyEvent)) {
    blockKeyboardEvent(keyEvent);
    logger.debug('Refresh shortcut blocked');
    return;
  }

  if (!isActivationKey(keyEvent.key)) {
    return;
  }

  const target = getContentEventTargetElement(keyEvent);
  if (!target) {
    return;
  }

  if (isContentOwnedElement(target)) {
    return;
  }

  const isEditing = target.classList.contains('sniptale-editing') || target.isContentEditable;
  if (!state.isInteractiveElement(target) || isEditing) {
    return;
  }

  blockKeyboardEvent(keyEvent);
  logger.debug('Key activation blocked', target);
}

export function handleLockerSelectStart(event: Event): void {
  const target = getContentEventTargetElement(event);
  if (!target) {
    return;
  }

  if (isContentOwnedElement(target)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  logger.debug('Text selection blocked');
}

export function createLockerKeyDownState(args: LockerInteractionState): LockerKeyDownState {
  return {
    ...args,
    isInteractiveElement: isInteractiveElementForLock,
  };
}

function isRefreshShortcut(event: KeyboardEvent): boolean {
  if (event.key === 'F5') {
    return true;
  }

  const lowerKey = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && lowerKey === 'r') {
    return true;
  }

  if (event.ctrlKey && event.key === 'F5') {
    return true;
  }

  return event.ctrlKey && event.shiftKey && lowerKey === 'r';
}

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

function blockKeyboardEvent(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
