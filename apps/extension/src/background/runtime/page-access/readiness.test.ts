import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';
import { browserScriptingExecuteScriptMock, sendTabMessageMock } from './service.test-support';
import { injectContentRuntimeAndAwaitReady, waitForContentRuntimeReady } from './readiness';

const VIEWPORT_COORDS_RESPONSE = {
  coords: { x: 0, y: 0, width: 100, height: 100, outerWidth: 100, outerHeight: 100 },
};

beforeEach(() => {
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
});

it('waits for the top-level content runtime after injecting the runtime', async () => {
  await injectContentRuntimeAndAwaitReady(
    {
      tab: { id: 7, url: 'https://example.test/path' } as chrome.tabs.Tab,
      tabId: 7,
      url: new URL('https://example.test/path'),
    },
    { allFrames: true }
  );

  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledWith({
    files: ['assets/contentRuntime.js'],
    injectImmediately: false,
    target: { allFrames: true, tabId: 7 },
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.GET_VIEWPORT_COORDS,
  });
});

it('retries readiness while the newly injected runtime has not registered its bridge yet', async () => {
  const wait = vi.fn(async () => undefined);
  const sendTabMessage = vi
    .fn()
    .mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.')
    )
    .mockResolvedValueOnce(VIEWPORT_COORDS_RESPONSE);

  await waitForContentRuntimeReady(12, { sendTabMessage, wait });

  expect(sendTabMessage).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledWith(50);
});

it('waits past a short listener registration delay before continuing active page actions', async () => {
  const wait = vi.fn(async () => undefined);
  const sendTabMessage = vi
    .fn()
    .mockRejectedValueOnce(new Error('Receiving end does not exist.'))
    .mockRejectedValueOnce(new Error('Receiving end does not exist.'))
    .mockRejectedValueOnce(new Error('Receiving end does not exist.'))
    .mockRejectedValueOnce(new Error('Receiving end does not exist.'))
    .mockResolvedValueOnce(VIEWPORT_COORDS_RESPONSE);

  await waitForContentRuntimeReady(12, { sendTabMessage, wait });

  expect(sendTabMessage).toHaveBeenCalledTimes(5);
  expect(wait).toHaveBeenCalledTimes(4);
  expect(wait).toHaveBeenCalledWith(50);
});

it('fails closed when the content runtime never becomes ready', async () => {
  const wait = vi.fn(async () => undefined);
  const sendTabMessage = vi.fn().mockResolvedValue({});

  await expect(waitForContentRuntimeReady(12, { sendTabMessage, wait })).rejects.toThrow(
    'Content runtime did not become ready'
  );

  expect(sendTabMessage).toHaveBeenCalledTimes(40);
  expect(wait).toHaveBeenCalledTimes(39);
});
