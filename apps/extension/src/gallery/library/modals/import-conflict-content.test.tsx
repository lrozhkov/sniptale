// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  formatDateTimeMock,
  getCurrentLocaleMock,
  modalFramePropsMock,
  productSelectPropsMock,
  translateMock,
} = vi.hoisted(() => ({
  formatDateTimeMock: vi.fn(() => 'localized-date'),
  getCurrentLocaleMock: vi.fn(() => 'en' as const),
  modalFramePropsMock: vi.fn(),
  productSelectPropsMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    formatDateTime: formatDateTimeMock,
    getCurrentLocale: getCurrentLocaleMock,
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

vi.mock('@sniptale/ui/product-form-controls', () => ({
  ProductSelect: (props: {
    disabled?: boolean;
    onChange: (value: 'duplicate') => void;
    options: Array<{ value: string }>;
    value: string;
  }) => {
    productSelectPropsMock(props);
    return (
      <button
        type="button"
        data-ui="test.conflict-select"
        disabled={props.disabled}
        onClick={() => props.onChange('duplicate')}
      >
        {props.value}
      </button>
    );
  },
}));

import { ImportConflictModalContent } from './import-conflict-content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createImportSummary(conflicts = ['asset-1', 'asset-2']) {
  return {
    archiveFingerprint: 'a'.repeat(64),
    assetCount: 3,
    conflicts,
    manifest: {
      assetCount: 3,
      effectBundleCount: 0,
      exportedAt: '2026-03-31T00:00:00.000Z',
      format: 'sniptale-backup',
      thumbnailCount: 2,
      version: 1,
    },
    rootCount: 3,
    thumbnailCount: 2,
    totalBytes: 1024,
  };
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
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

it('uses one conflict dropdown and confirms the selected strategy', async () => {
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

  const select = container?.querySelector<HTMLButtonElement>('[data-ui="test.conflict-select"]');
  const restoreButton = findButton('gallery.importModal.restore');
  const closeButton = findButton('close');
  if (!select || !restoreButton || !closeButton) {
    throw new Error('Expected import confirmation controls');
  }

  expect(select.textContent).toBe('skip');
  expect(restoreButton.className).toContain('cursor-pointer');
  expect(productSelectPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      controlSize: 'md',
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'skip' }),
        expect.objectContaining({ value: 'duplicate' }),
        expect.objectContaining({ value: 'replace' }),
      ]),
      value: 'skip',
    })
  );
  expect(container?.textContent).toContain('gallery.importModal.skipDescription');

  await act(async () => {
    select.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(container?.textContent).toContain('gallery.importModal.duplicateDescription');

  await act(async () => {
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    restoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });

  expect(modalFramePropsMock).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'gallery.importModal.title' })
  );
  expect(container?.textContent).toContain('gallery.importModal.assets');
  expect(container?.textContent).toContain('gallery.importModal.thumbnails');
  expect(container?.textContent).toContain('gallery.importModal.conflicts');
  expect(container?.textContent).toContain('gallery.importModal.formatVersionPrefix 1');
  expect(container?.textContent).toContain('gallery.importModal.exportedAtPrefix localized-date');
  expect(formatDateTimeMock).toHaveBeenCalledWith(
    new Date('2026-03-31T00:00:00.000Z'),
    { dateStyle: 'medium', timeStyle: 'short' },
    'en'
  );
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onImport).toHaveBeenCalledOnce();
  expect(onImport).toHaveBeenCalledWith('duplicate');
});

it('locks a resumed restore to its persisted conflict strategy', async () => {
  const onImport = vi.fn(async () => undefined);
  act(() => {
    root?.render(
      <ImportConflictModalContent
        fixedStrategy="skip"
        summary={createImportSummary()}
        onClose={vi.fn()}
        onImport={onImport}
      />
    );
  });

  const select = container?.querySelector<HTMLButtonElement>('[data-ui="test.conflict-select"]');
  const restoreButton = findButton('gallery.importModal.restore');
  if (!select || !restoreButton) {
    throw new Error('Expected locked restore controls');
  }
  expect(select.disabled).toBe(true);
  expect(select.textContent).toBe('skip');

  await act(async () => {
    restoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  expect(onImport).toHaveBeenCalledOnce();
  expect(onImport).toHaveBeenCalledWith('skip');
});

it('asks only for confirmation when the backup has no matching items', async () => {
  const onImport = vi.fn(async () => undefined);
  act(() => {
    root?.render(
      <ImportConflictModalContent
        summary={createImportSummary([])}
        onClose={vi.fn()}
        onImport={onImport}
      />
    );
  });

  expect(container?.querySelector('[data-ui="test.conflict-select"]')).toBeNull();
  expect(container?.textContent).not.toContain('gallery.importModal.conflicts');
  expect(modalFramePropsMock).toHaveBeenCalledWith(
    expect.objectContaining({ description: 'gallery.importModal.noConflictsDescription' })
  );

  await act(async () => {
    findButton('gallery.importModal.restore')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await Promise.resolve();
  });
  expect(onImport).toHaveBeenCalledWith('skip');
});
