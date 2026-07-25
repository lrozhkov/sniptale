import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const setDefaultBorderPresetWithOutcome = vi.hoisted(() => vi.fn());

vi.mock('../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/highlighter')>()),
  setDefaultBorderPresetWithOutcome,
}));

import { routeHighlighterSettingsMutationMessage } from './route';

const senderBinding = {
  documentId: 'document-1',
  frameId: 0,
  senderUrl: 'https://example.test/page',
  tabId: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  setDefaultBorderPresetWithOutcome.mockResolvedValue('applied');
});

it('routes an authorized default mutation through the background persistence owner', async () => {
  const sendResponse = vi.fn();
  const handled = routeHighlighterSettingsMutationMessage({
    message: {
      operation: 'set-default-border-preset',
      presetId: 'system-marker',
      type: MessageType.HIGHLIGHTER_SETTINGS_MUTATION,
    },
    senderBinding,
    sendResponse,
  });

  expect(handled).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      result: 'accepted',
      success: true,
    })
  );
  expect(setDefaultBorderPresetWithOutcome).toHaveBeenCalledWith('system-marker');
});

it('fails closed without a preauthorized content sender binding', () => {
  const sendResponse = vi.fn();

  expect(
    routeHighlighterSettingsMutationMessage({
      message: {
        operation: 'set-default-border-preset',
        presetId: 'system-marker',
        type: MessageType.HIGHLIGHTER_SETTINGS_MUTATION,
      },
      senderBinding: null,
      sendResponse,
    })
  ).toBe(true);
  expect(setDefaultBorderPresetWithOutcome).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized highlighter settings mutation',
    success: false,
  });
});

it('declines malformed or unrelated messages without side effects', () => {
  const sendResponse = vi.fn();

  expect(
    routeHighlighterSettingsMutationMessage({
      message: {
        operation: 'replace-catalog',
        presetId: 'system-marker',
        type: MessageType.HIGHLIGHTER_SETTINGS_MUTATION,
      },
      senderBinding,
      sendResponse,
    })
  ).toBe(false);
  expect(setDefaultBorderPresetWithOutcome).not.toHaveBeenCalled();
  expect(sendResponse).not.toHaveBeenCalled();
});

it('reports a rejected persistence command as a route failure', async () => {
  const sendResponse = vi.fn();
  setDefaultBorderPresetWithOutcome.mockResolvedValue('rejected');

  expect(
    routeHighlighterSettingsMutationMessage({
      message: {
        operation: 'set-default-border-preset',
        presetId: 'system-marker',
        type: MessageType.HIGHLIGHTER_SETTINGS_MUTATION,
      },
      senderBinding,
      sendResponse,
    })
  ).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Highlighter preset target was rejected',
      success: false,
    })
  );
});
