import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import {
  appendConsoleEvent,
  appendExceptionEvent,
  appendNetworkFailureEvent,
  appendNetworkResponseEvent,
  appendPendingNetworkRequest,
} from './cdp.event-appenders';
import type { MaybeFlush } from './cdp.types';
import {
  isConsoleAPICalledEvent,
  isExceptionThrownEvent,
  isLoadingFailedEvent,
  isRequestWillBeSentEvent,
  isResponseReceivedEvent,
} from './cdp.types';

export function dispatchDebuggerEvent(args: {
  method: string;
  session: ActiveDiagnosticsSession;
  tsMs: number;
  params: unknown;
  maybeFlush: MaybeFlush;
}): void {
  if (args.method === 'Runtime.consoleAPICalled') {
    if (!isConsoleAPICalledEvent(args.params)) {
      return;
    }

    appendConsoleEvent(args.session, args.tsMs, args.params, args.maybeFlush);
    return;
  }

  if (args.method === 'Runtime.exceptionThrown') {
    if (!isExceptionThrownEvent(args.params)) {
      return;
    }

    appendExceptionEvent(args.session, args.tsMs, args.params, args.maybeFlush);
    return;
  }

  if (args.method === 'Network.requestWillBeSent') {
    if (!isRequestWillBeSentEvent(args.params)) {
      return;
    }

    appendPendingNetworkRequest(args.session, args.tsMs, args.params);
    return;
  }

  if (args.method === 'Network.responseReceived') {
    if (!isResponseReceivedEvent(args.params)) {
      return;
    }

    appendNetworkResponseEvent(args.session, args.tsMs, args.params, args.maybeFlush);
    return;
  }

  if (args.method === 'Network.loadingFailed' && isLoadingFailedEvent(args.params)) {
    appendNetworkFailureEvent(args.session, args.params, args.maybeFlush);
  }
}
