import type { DiagnosticEventFromCS } from '@sniptale/platform/observability/diagnostics/types';
import {
  buildUserActionMessage,
  describeDiagnosticElement,
  isDiagnosticLoggerTargetEnabled,
} from './logger.helpers';

type DiagnosticLoggerActionState = {
  isEnabled: boolean;
  lastScrollY: number;
  scrollTimeoutId: number | null;
};

type DiagnosticActionHandlerArgs = {
  sendEvent: (event: Omit<DiagnosticEventFromCS, 'tsMs'>) => void;
  state: DiagnosticLoggerActionState;
};

export type DiagnosticActionHandlers = {
  handleKeyAction: (event: KeyboardEvent) => void;
  handleScrollAction: (event: Event) => void;
  handleUserAction: (event: Event) => void;
};

const SCROLL_THROTTLE_MS = 500;

export function createDiagnosticActionHandlers(
  args: DiagnosticActionHandlerArgs
): DiagnosticActionHandlers {
  return {
    handleKeyAction: (event: KeyboardEvent) => handleDiagnosticKeyAction(args, event),
    handleScrollAction: (event: Event) => handleDiagnosticScrollAction(args, event),
    handleUserAction: (event: Event) => handleDiagnosticUserAction(args, event),
  };
}

function handleDiagnosticUserAction(args: DiagnosticActionHandlerArgs, event: Event): void {
  if (!args.state.isEnabled || !isDiagnosticLoggerTargetEnabled(event.target)) {
    return;
  }

  const targetInfo = describeDiagnosticElement(event.target);
  args.sendEvent({
    kind: 'action',
    level: 'log',
    message: buildUserActionMessage(event.type, targetInfo),
    data: {
      actionType: event.type,
      target: targetInfo,
      valueLength: event.target instanceof HTMLInputElement ? event.target.value.length : undefined,
    },
  });
}

function handleDiagnosticKeyAction(args: DiagnosticActionHandlerArgs, event: KeyboardEvent): void {
  const isSpecialKey =
    event.key === 'Enter' ||
    event.key === 'Escape' ||
    event.key === 'Tab' ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey;
  if (!args.state.isEnabled || !isDiagnosticLoggerTargetEnabled(event.target) || !isSpecialKey) {
    return;
  }

  args.sendEvent({
    kind: 'action',
    level: 'log',
    message: [
      `keydown: ${event.key}`,
      event.ctrlKey ? ' + Ctrl' : '',
      event.metaKey ? ' + Meta' : '',
      event.altKey ? ' + Alt' : '',
    ].join(''),
    data: {
      actionType: 'keydown',
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      target: describeDiagnosticElement(event.target),
    },
  });
}

function handleDiagnosticScrollAction(args: DiagnosticActionHandlerArgs, event: Event): void {
  if (!args.state.isEnabled) {
    return;
  }

  if (event.target && !isDiagnosticLoggerTargetEnabled(event.target)) {
    return;
  }

  if (args.state.scrollTimeoutId !== null) {
    return;
  }

  args.state.scrollTimeoutId = window.setTimeout(() => {
    args.state.scrollTimeoutId = null;
    if (!args.state.isEnabled) {
      return;
    }

    const currentScrollY = window.scrollY;
    const direction: 'up' | 'down' = currentScrollY > args.state.lastScrollY ? 'down' : 'up';
    const delta = Math.abs(currentScrollY - args.state.lastScrollY);
    if (delta < 10) {
      return;
    }

    args.state.lastScrollY = currentScrollY;
    args.sendEvent({
      kind: 'action',
      level: 'log',
      message: `scroll ${direction}`,
      data: { actionType: 'scroll', direction, scrollY: currentScrollY, delta },
    });
  }, SCROLL_THROTTLE_MS);
}
