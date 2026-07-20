// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { modalFramePropsMock, translateMock } = vi.hoisted(() => ({
  modalFramePropsMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    translate: translateMock,
  };
});

vi.mock('./frame', () => ({
  GalleryModalFrame: (props: { children: React.ReactNode; onClose: () => void; title: string }) => {
    modalFramePropsMock(props);
    return (
      <div data-ui="test.modal-frame">
        <button type="button" onClick={props.onClose}>
          close
        </button>
        <div>{props.title}</div>
        {props.children}
      </div>
    );
  },
}));

import { ImportConflictModalContent } from './import-conflict-content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createImportSummary() {
  return {
    assetCount: 3,
    conflicts: ['asset-1', 'asset-2'],
    manifest: {
      assetCount: 3,
      effectBundleCount: 0,
      exportedAt: '2026-03-31T00:00:00.000Z',
      format: 'sniptale-backup',
      thumbnailCount: 2,
      version: 1,
    },
    thumbnailCount: 2,
  };
}

function getImportActionButtons() {
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const closeButton = buttons.find((button) => button.textContent === 'close');
  const replaceButton = buttons.find((button) =>
    button.textContent?.includes('gallery.importModal.replaceTitle')
  );
  const skipButton = buttons.find((button) =>
    button.textContent?.includes('gallery.importModal.skipTitle')
  );
  const duplicateButton = buttons.find((button) =>
    button.textContent?.includes('gallery.importModal.duplicateTitle')
  );

  if (!closeButton || !replaceButton || !skipButton || !duplicateButton) {
    throw new Error('Expected import modal controls');
  }

  return { closeButton, duplicateButton, replaceButton, skipButton };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders import summary, manifest banner, and strategy actions', async () => {
  const onClose = vi.fn();
  const onImport = vi.fn(async () => undefined);

  act(() => {
    root?.render(
      <ImportConflictModalContent
        summary={createImportSummary()}
        onClose={onClose}
        onImport={onImport}
      />
    );
  });

  const { closeButton, duplicateButton, replaceButton, skipButton } = getImportActionButtons();

  await act(async () => {
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    replaceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    skipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    duplicateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });

  expect(modalFramePropsMock).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'gallery.importModal.title' })
  );
  expect(container?.textContent).toContain('gallery.importModal.assets');
  expect(container?.textContent).toContain('gallery.importModal.thumbnails');
  expect(container?.textContent).toContain('gallery.importModal.conflicts');
  expect(container?.textContent).toContain('gallery.importModal.formatVersionPrefix 1.');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onImport).toHaveBeenNthCalledWith(1, 'replace');
  expect(onImport).toHaveBeenNthCalledWith(2, 'skip');
  expect(onImport).toHaveBeenNthCalledWith(3, 'duplicate');
});
