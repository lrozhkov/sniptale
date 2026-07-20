// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { requestErasureMock } = vi.hoisted(() => ({ requestErasureMock: vi.fn() }));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../runtime/privacy-erasure-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/privacy-erasure-client')>()),
  requestLocalExtensionDataErasure: requestErasureMock,
}));
import { PrivacySection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PrivacySection />);
  });
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent === label
  );
  expect(button).toBeDefined();
  return button!;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  requestErasureMock.mockResolvedValue({
    failedRequiredParticipantIds: [],
    indexedDbStoresCleared: 19,
    localStorageKeysRemoved: [],
    participants: [],
    success: true,
    sessionStorageKeysRemoved: [],
    syncStorageKeysRemoved: [],
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('requires confirmation before deleting local data with preserved preferences and AI keys', async () => {
  await renderSection();

  await act(async () => {
    findButton('settings.privacy.startDelete').click();
  });
  expect(requestErasureMock).not.toHaveBeenCalled();

  await act(async () => {
    findButton('settings.privacy.confirmDelete').click();
  });

  expect(requestErasureMock).toHaveBeenCalledWith({
    includeAiProviderSecrets: false,
    preservePreferences: true,
  });
  expect(container?.textContent).toContain('settings.privacy.success');
});

it('runs factory reset with preferences and AI provider secrets included', async () => {
  await renderSection();

  await act(async () => {
    findButton('settings.privacy.startFactoryReset').click();
  });
  await act(async () => {
    findButton('settings.privacy.confirmFactoryReset').click();
  });

  expect(requestErasureMock).toHaveBeenCalledWith({
    includeAiProviderSecrets: true,
    preservePreferences: false,
  });
});

it('shows the background-owned erasure failure without reporting success', async () => {
  requestErasureMock.mockRejectedValueOnce(new Error('transaction verification failed'));
  await renderSection();

  await act(async () => {
    findButton('settings.privacy.startFactoryReset').click();
  });
  await act(async () => {
    findButton('settings.privacy.confirmFactoryReset').click();
  });

  expect(container?.textContent).toContain('transaction verification failed');
  expect(container?.textContent).not.toContain('settings.privacy.success');
});
