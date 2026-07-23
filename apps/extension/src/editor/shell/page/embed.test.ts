// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { saveEditorRenderedImageMock } = vi.hoisted(() => ({
  saveEditorRenderedImageMock: vi.fn(),
}));

vi.mock('../../document/file-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/file-actions')>()),
  saveEditorRenderedImage: saveEditorRenderedImageMock,
}));

import { createScenarioEditorEmbedCloseMessage } from '../../../features/editor/contracts/embed';
import { createImageEditorController } from '../../controller';
import { createEditorPageEmbedProviderValue } from './embed';

beforeEach(() => {
  vi.clearAllMocks();
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
    createScenarioEditorEmbedCloseMessage(),
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
