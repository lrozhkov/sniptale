// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const { loadMock, saveMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  saveMock: vi.fn(),
}));
vi.mock(
  '../../../composition/persistence/highlighter/additional-settings',
  async (importOriginal) => ({
    ...(await importOriginal()),
    loadHighlighterAdditionalSettingsOpen: loadMock,
    saveHighlighterAdditionalSettingsOpen: saveMock,
  })
);

import { AdditionalSettings } from './inspector-fields';

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  vi.clearAllMocks();
});

async function renderAdditionalSettings() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <AdditionalSettings section="callout-text">
        <span>Advanced content</span>
      </AdditionalSettings>
    );
  });
  return host.querySelector('details')!;
}

it('restores and remembers the open state across panel remounts', async () => {
  loadMock.mockResolvedValue(true);
  const details = await renderAdditionalSettings();
  await act(async () => Promise.resolve());
  expect(details.open).toBe(true);

  await act(async () => {
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
  });
  expect(saveMock).toHaveBeenCalledWith('callout-text', false);

  await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;

  const reopenedDetails = await renderAdditionalSettings();
  expect(reopenedDetails.open).toBe(false);
  expect(loadMock).toHaveBeenCalledTimes(1);
});
