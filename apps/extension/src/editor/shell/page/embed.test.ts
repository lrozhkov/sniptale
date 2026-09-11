// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { saveEditorRenderedImageMock } = vi.hoisted(() => ({
  saveEditorRenderedImageMock: vi.fn(),
}));

vi.mock('../../document/file-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/file-actions')>()),
  saveEditorRenderedImage: saveEditorRenderedImageMock,
}));

vi.mock('../../controller/canvas-ready', () => ({
  waitForEditorControllerCanvas: vi.fn(async () => undefined),
}));
import {
  createScenarioEditorEmbedInitMessage,
  createScenarioEditorEmbedCloseMessage,
} from '../../../features/editor/contracts/embed';
import { createImageEditorController } from '../../controller';
import { startScenarioEditorEmbed, createEditorPageEmbedProviderValue } from './embed';

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/editor?embed=scenario&embedSession=session-test');
});

it('returns an inert provider contract outside scenario embed mode', () => {
  const controller = createImageEditorController();

  expect(createEditorPageEmbedProviderValue(null, controller)).toEqual({
    mode: null,
    onApply: null,
    onClose: null,
  });
});

it('routes scenario apply and close through the render and parent-message adapters', async () => {
  const controller = createImageEditorController();
  const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  const providerValue = createEditorPageEmbedProviderValue('scenario', controller);

  await providerValue.onApply?.();
  providerValue.onClose?.();

  expect(saveEditorRenderedImageMock).toHaveBeenCalledWith(controller);
  expect(postMessage).toHaveBeenCalledWith(
    createScenarioEditorEmbedCloseMessage('session-test'),
    window.location.origin
  );
});

it('preserves apply rejection for the canonical editor action reporter', async () => {
  const controller = createImageEditorController();
  const error = new Error('render failed');
  saveEditorRenderedImageMock.mockRejectedValueOnce(error);
  const providerValue = createEditorPageEmbedProviderValue('scenario', controller);

  await expect(providerValue.onApply?.()).rejects.toBe(error);
});

afterEach(() => vi.restoreAllMocks());
it('initializes once from the exact parent, origin and session without page persistence', async () => {
  const parentWindow = { postMessage: vi.fn() } as unknown as Window;
  vi.spyOn(window, 'parent', 'get').mockReturnValue(parentWindow);
  const controller = createImageEditorController();
  const open = vi.spyOn(controller, 'openImage').mockResolvedValue(undefined);
  const title = vi.fn();
  const stop = startScenarioEditorEmbed({ controller, setPageTitle: title });
  const payload = createScenarioEditorEmbedInitMessage('session-test', {
    dataUrl: 'data:image/png;base64,abc',
    title: 'Guide image',
  });
  const send = (source: Window, origin: string, data: unknown) =>
    window.dispatchEvent(new MessageEvent('message', { source, origin, data }));
  send(window, window.location.origin, payload);
  send(parentWindow, 'https://foreign.test', payload);
  send(parentWindow, window.location.origin, { ...payload, sessionId: 'stale' });
  expect(open).not.toHaveBeenCalled();
  send(parentWindow, window.location.origin, payload);
  send(parentWindow, window.location.origin, payload);
  await Promise.resolve();
  await Promise.resolve();
  expect(open).toHaveBeenCalledOnce();
  expect(title).toHaveBeenCalledWith('Guide image');
  expect(controller.autosaveService).toBeNull();
  stop();
  send(parentWindow, window.location.origin, payload);
  expect(open).toHaveBeenCalledOnce();
});
it('reports a fixed load error and cancels work before canvas readiness', async () => {
  const parentWindow = { postMessage: vi.fn() } as unknown as Window;
  vi.spyOn(window, 'parent', 'get').mockReturnValue(parentWindow);
  const controller = createImageEditorController();
  const open = vi.spyOn(controller, 'openImage').mockRejectedValue(new Error('private data'));
  const message = createScenarioEditorEmbedInitMessage('session-test', {
    dataUrl: 'data:image/png;base64,abc',
  });
  const send = () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: parentWindow,
        origin: window.location.origin,
        data: message,
      })
    );
  const stop = startScenarioEditorEmbed({ controller, setPageTitle: vi.fn() });
  send();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(parentWindow.postMessage).toHaveBeenLastCalledWith(
    {
      source: 'sniptale-editor-embed',
      type: 'scenario-error',
      sessionId: 'session-test',
      code: 'load-failed',
    },
    window.location.origin
  );
  stop();
  open.mockClear();
  const cancel = startScenarioEditorEmbed({ controller, setPageTitle: vi.fn() });
  send();
  cancel();
  await Promise.resolve();
  expect(open).not.toHaveBeenCalled();
});
