// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/video-editor-preview-preferences',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/video-editor-preview-preferences')
    >()),
    loadVideoEditorPreviewPreferences: mocks.load,
    saveVideoEditorPreviewPreferences: mocks.save,
  })
);

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toastError },
}));

import { useVideoEditorPreviewPreferences } from './preview-preferences';

let container: HTMLDivElement;
let root: Root;

function Harness() {
  const state = useVideoEditorPreviewPreferences();
  return (
    <>
      <output data-state>{`${state.preferences.mode}:${String(state.saveFailed)}`}</output>
      <button
        type="button"
        data-update
        onClick={() => state.updatePreferences({ mode: 'cache' })}
      />
      <button type="button" data-retry onClick={state.retrySave} />
    </>
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.load.mockReset().mockResolvedValue({
    invalidFieldCount: 0,
    preferences: { mode: 'live', rasterPreset: '720p', zoom: 'fit' },
  });
  mocks.save.mockReset();
  mocks.toastError.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps the selected behavior and exposes a retry after a durable save failure', async () => {
  mocks.save.mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<Harness />));

  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-update]')?.click();
    await Promise.resolve();
  });
  expect(container.querySelector('[data-state]')?.textContent).toBe('cache:true');
  expect(mocks.toastError).toHaveBeenCalledOnce();

  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-retry]')?.click();
    await Promise.resolve();
  });
  expect(container.querySelector('[data-state]')?.textContent).toBe('cache:false');
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.save).toHaveBeenLastCalledWith({ mode: 'cache', rasterPreset: '720p', zoom: 'fit' });
});
