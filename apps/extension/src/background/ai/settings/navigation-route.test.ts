import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { openSettingsPageMock } = vi.hoisted(() => ({ openSettingsPageMock: vi.fn() }));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openSettingsPage: openSettingsPageMock,
}));

import { routeAiSettingsNavigationMessage } from './navigation-route';
import type { BackgroundOwnedRouteContext } from '../../routing-contracts/owned-route-context';

const routeContext = {
  authorityFamily: 'ai-settings-navigation-authority',
  freshnessReplay: 'sync-policy-approved',
  messageBinding: { type: MessageType.AI_SETTINGS_NAVIGATION },
  ownerRoute: {
    handlerId: 'ai-settings-navigation',
    messageTypes: [MessageType.AI_SETTINGS_NAVIGATION],
    ownerModule: 'apps/extension/src/background/ai/settings/navigation-route.ts',
    policyStateIds: [],
    routeAuthorityFamily: 'background-owned-ipc',
  },
  preauthorization: { kind: 'background-owned-route-policy' },
  senderClassification: 'content-tab-runtime',
} satisfies BackgroundOwnedRouteContext;
const contentIntent = { requestId: 'request-1', token: 'token-1' };

beforeEach(() => {
  vi.clearAllMocks();
  openSettingsPageMock.mockResolvedValue(undefined);
});

it('opens only the bounded AI settings destination through the background page owner', async () => {
  const sendResponse = vi.fn();
  expect(
    routeAiSettingsNavigationMessage(
      { contentIntent, section: 'ai-prompts', type: MessageType.AI_SETTINGS_NAVIGATION },
      sendResponse,
      routeContext
    )
  ).toBe(true);

  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ result: 'accepted', success: true })
  );
  expect(openSettingsPageMock).toHaveBeenCalledWith({ route: { section: 'ai-prompts' } });
});

it('fails closed without matching route authority', () => {
  const sendResponse = vi.fn();
  expect(
    routeAiSettingsNavigationMessage(
      { contentIntent, section: 'ai-connections', type: MessageType.AI_SETTINGS_NAVIGATION },
      sendResponse,
      null
    )
  ).toBe(true);

  expect(openSettingsPageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized AI settings navigation sender',
    success: false,
  });
});

it('declines malformed and neighboring settings destinations', () => {
  expect(
    routeAiSettingsNavigationMessage(
      { contentIntent, section: 'annotations', type: MessageType.AI_SETTINGS_NAVIGATION },
      vi.fn(),
      routeContext
    )
  ).toBe(false);
});
