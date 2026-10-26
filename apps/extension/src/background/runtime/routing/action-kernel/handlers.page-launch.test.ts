import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { createActionContext } from './context';
import { getActionRouteHandler } from './registry';
import type { BackgroundOwnedAction, UnknownAction } from './types';
const { route, authorize } = vi.hoisted(() => ({ route: vi.fn(), authorize: vi.fn() }));
vi.mock('../../page-access/page-launch-preferences', () => ({
  routePageLaunchPreferencesMessage: route,
}));
vi.mock('../authorization/owned', async (original) => ({
  ...(await original<typeof import('../authorization/owned')>()),
  authorizeBackgroundOwnedRouteMaybeAsync: authorize,
}));
beforeEach(() => {
  vi.clearAllMocks();
  route.mockReturnValue(true);
  authorize.mockReturnValue({ authorized: true });
});
it('dispatches the typed corner command through its registered owner and retains the response channel', () => {
  const context = createActionContext({
    logger: { warn: vi.fn() },
    runtimeState: createBackgroundRuntimeState(),
    sendResponse: vi.fn(),
    sender: {
      url: 'https://example.test',
      frameId: 0,
      documentId: 'native-document',
    },
  });
  const message = { type: MessageType.PAGE_LAUNCH_PREFERENCES, corner: 'top-left' as const };
  const action: BackgroundOwnedAction = {
    actionKind: 'background-owned',
    context,
    message,
    routeName: `background-owned:${message.type}`,
  };
  const handler = getActionRouteHandler(action.routeName);
  expect(handler).toBeTypeOf('function');
  expect(handler!(action)).toEqual({ handled: true, keepChannelOpen: true });
  expect(route).toHaveBeenCalledWith(message, context.sendResponse);
  const wrong: UnknownAction = {
    actionKind: 'unknown',
    context,
    message: { type: 'UNKNOWN' },
    routeName: 'unknown',
  };
  expect(handler!(wrong)).toEqual({ handled: false });
  expect(getActionRouteHandler('unknown')?.(wrong)).toEqual({
    handled: true,
    keepChannelOpen: false,
  });
  expect(context.sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unknown message type',
  });
  expect(
    getActionRouteHandler('internal-signal')?.({
      actionKind: 'internal-signal',
      context,
      routeName: 'internal-signal',
    })
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(route).toHaveBeenCalledOnce();
});
