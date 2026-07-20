import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import type { RuntimeMessagePreflightRoute } from '../boundary/preflight';
import {
  adaptImmediateLegacyRouteToAction,
  adaptTabLegacyRouteToAction,
  actionRouteMetadata,
  createActionContext,
  dispatchAction,
  getActionRouteHandler,
  getActionRouteMetadata,
  getActionRouteMessageTypesByKind,
  legacyActionRouteRegistry,
  type ActionContext,
} from './index';

function createContext(): ActionContext {
  return createActionContext({
    logger: { warn: vi.fn() },
    runtimeState: createBackgroundRuntimeState(),
    sendResponse: vi.fn(),
    sender: {
      documentId: 'document-1',
      frameId: 0,
      url: 'https://example.test/page',
    },
  });
}

function createKnownBackgroundOwnedAction() {
  return adaptImmediateLegacyRouteToAction({
    context: createContext(),
    parsedMessage: { type: MessageType.REQUEST_LLM_SESSION },
    route: { kind: 'background-owned' },
  });
}

function expectActionHasKind(
  action: ReturnType<typeof adaptImmediateLegacyRouteToAction>,
  actionKind: string,
  routeName: string
): void {
  expect(action).not.toHaveProperty('legacyRoute');
  expect(action).toEqual(expect.objectContaining({ actionKind, routeName }));
}

it('maps parsed legacy background routes into exact action names with runtime context', () => {
  const action = createKnownBackgroundOwnedAction();

  expectActionHasKind(
    action,
    'background-owned',
    `background-owned:${MessageType.REQUEST_LLM_SESSION}`
  );
  expect(action.context).toEqual(
    expect.objectContaining({
      documentId: 'document-1',
      frameId: 0,
      origin: 'https://example.test',
      senderUrl: 'https://example.test/page',
      tabId: null,
    })
  );
});

it('maps every immediate preflight family into action-kind dispatch metadata', () => {
  const context = createContext();
  const parsedMessage = { type: MessageType.REQUEST_LLM_SESSION };
  const videoMessage = { type: VideoMessageType.GET_RECORDING_STATE };

  expectActionHasKind(
    adaptImmediateLegacyRouteToAction({
      context,
      parsedMessage,
      route: { kind: 'internal-signal' },
    }),
    'internal-signal',
    'internal-signal'
  );
  expectActionHasKind(
    adaptImmediateLegacyRouteToAction({
      context,
      parsedMessage,
      route: { kind: 'video-runtime', message: videoMessage },
    }),
    'video-runtime',
    `video-runtime:${VideoMessageType.GET_RECORDING_STATE}`
  );
  expectActionHasKind(
    adaptImmediateLegacyRouteToAction({
      context,
      parsedMessage,
      route: { kind: 'unknown' },
    }),
    'unknown',
    'unknown'
  );
});

it('keeps supported legacy families discoverable from one registry', () => {
  expect(legacyActionRouteRegistry.map((entry) => entry.routeName)).toEqual(
    expect.arrayContaining([
      'internal-signal',
      'unknown',
      `background-owned:${MessageType.PROCESS_WITH_LLM}`,
      `tab:${MessageType.EXPORT_CAPTURE_FULL_PAGE}`,
      `video-runtime:${VideoMessageType.GET_RECORDING_STATE}`,
    ])
  );
  expect(getActionRouteHandler(`tab:${MessageType.EXPORT_CAPTURE_FULL_PAGE}`)).toBeDefined();
  expect(
    getActionRouteHandler(`video-runtime:${VideoMessageType.GET_RECORDING_STATE}`)
  ).toBeDefined();
});

it('exposes parser-supported route message types by action kind', () => {
  expect(getActionRouteMessageTypesByKind('background-owned')).toEqual(
    expect.arrayContaining([MessageType.REQUEST_LLM_SESSION])
  );
  expect(getActionRouteMessageTypesByKind('tab')).toEqual(
    expect.arrayContaining([MessageType.EXPORT_CAPTURE_FULL_PAGE])
  );
  expect(getActionRouteMessageTypesByKind('video-runtime')).toEqual(
    expect.arrayContaining([VideoMessageType.GET_RECORDING_STATE])
  );
});

it('records action owner metadata next to each registry entry', () => {
  expect(actionRouteMetadata.length).toBe(legacyActionRouteRegistry.length);
  expect(getActionRouteMetadata(`tab:${MessageType.EXPORT_CAPTURE_FULL_PAGE}`)).toEqual(
    expect.objectContaining({
      actionKind: 'tab',
      authorityFamily: 'capture-privileged-tab-route',
      handlerAdapter: 'routeTabAction',
      keepChannelBehaviorSource: 'tab-routing-adapter',
      messageType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      ownerModule: 'apps/extension/src/background/capture/routing/actions.export.ts',
      requiredAuthority: 'privileged tab capture authorization policy',
      sideEffects:
        'screenshot capture, editor open, staged download, HAR, gallery, or web snapshot',
      support: 'parser-supported',
      transitiveStateOwner: 'capture routing and media-hub storage owners',
    })
  );
  expect(getActionRouteMetadata(`video-runtime:${VideoMessageType.START_PROJECT_EXPORT}`)).toEqual(
    expect.objectContaining({
      actionKind: 'video-runtime',
      acceptedSenderClass: 'video editor owner presenting project-export start/cancel authority',
      authorityFamily: 'project-export-capability',
      keepChannelBehaviorSource: 'video-runtime-project-export-authority',
      ownerModule:
        'apps/extension/src/background/media/video/runtime/handlers/export/project-export.ts',
      requiredAuthority: 'project export start/cancel preauthorization',
      responseShape: 'project export start/cancel route response',
    })
  );
  expect(getActionRouteMetadata(`tab:${MessageType.SCENARIO_GET_SESSION}`)).toEqual(
    expect.objectContaining({
      ownerModule: 'apps/extension/src/background/scenario/router/index.ts',
    })
  );
});

it('fails closed when a legacy adapter creates an unsupported action route', () => {
  const context = createContext();
  const sendResponse = vi.mocked(context.sendResponse);
  const action = adaptImmediateLegacyRouteToAction({
    context,
    parsedMessage: { type: 'UNSUPPORTED_BACKGROUND_OWNER' },
    route: { kind: 'background-owned' } satisfies RuntimeMessagePreflightRoute,
  });

  expect(dispatchAction(action)).toEqual({ handled: true, keepChannelOpen: false });
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unsupported action route',
    success: false,
  });
});

it('keeps the response channel open for tab-routed messages', () => {
  const context = createContext();
  const action = adaptTabLegacyRouteToAction({
    context,
    resolvedTabId: undefined,
    route: {
      kind: 'tab',
      tabMessage: { type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
    },
  });

  expect(action).not.toHaveProperty('legacyRoute');
  expect(action.actionKind).toBe('tab');
  expect(dispatchAction(action)).toEqual({ handled: true, keepChannelOpen: true });
});

it('rejects registry handler calls with mismatched action variants', () => {
  const action = createKnownBackgroundOwnedAction();

  expect(getActionRouteHandler(action.routeName)?.(action).handled).toBeTypeOf('boolean');
  expect(getActionRouteHandler('internal-signal')?.(action)).toEqual({ handled: false });
  expect(getActionRouteHandler('unknown')?.(action)).toEqual({ handled: false });
  expect(getActionRouteHandler(`tab:${MessageType.EXPORT_CAPTURE_FULL_PAGE}`)?.(action)).toEqual({
    handled: false,
  });
  expect(
    getActionRouteHandler(`video-runtime:${VideoMessageType.GET_RECORDING_STATE}`)?.(action)
  ).toEqual({ handled: false });
});
