// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCleanupGroup } from '../actions/test-support/index';

const { formatDateMock, modalFramePropsMock, translateMock } = vi.hoisted(() => ({
  formatDateMock: vi.fn((timestamp: number) => `date:${timestamp}`),
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

vi.mock('../ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui')>();
  return {
    ...actual,
    formatDate: formatDateMock,
  };
});

interface MockModalFrameProps {
  children: React.ReactNode;
  onClose: () => void;
  panelClassName?: string;
  title: string;
}

vi.mock('./frame', () => ({
  GalleryModalFrame: (props: MockModalFrameProps) => {
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

import { StorageManagerModalContent } from './storage-manager-content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStorageReport() {
  const populatedGroup = createCleanupGroup({
    id: 'heavy-files',
    potentialBytes: 4096,
    items: [
      {
        id: 'asset-1',
        filename: 'capture.png',
        size: 1024,
        createdAt: 1,
        kind: 'image',
        target: 'asset',
      },
    ],
  });
  const emptyGroup = createCleanupGroup({
    id: 'old-screenshots',
    title: 'Старые скриншоты',
    items: [],
    potentialBytes: 0,
  });

  return {
    emptyGroup,
    populatedGroup,
    report: { groups: [populatedGroup, emptyGroup], potentialBytes: 8192 },
  };
}

function getStorageButtons() {
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const closeButton = buttons.find((button) => button.textContent === 'close');
  const deleteButtons = buttons.filter((button) =>
    button.textContent?.includes('gallery.storageManager.deleteGroup')
  );

  if (!closeButton || deleteButtons.length !== 1) {
    throw new Error('Expected storage manager controls');
  }

  return { closeButton, deleteButtons };
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

it('renders actionable groups and run wiring for storage cleanup', async () => {
  const onClose = vi.fn();
  const onRun = vi.fn(async () => undefined);
  const { emptyGroup, populatedGroup, report } = createStorageReport();

  act(() => {
    root?.render(<StorageManagerModalContent report={report} onClose={onClose} onRun={onRun} />);
  });

  const { closeButton, deleteButtons } = getStorageButtons();

  await act(async () => {
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    deleteButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });

  expect(modalFramePropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      panelClassName: expect.stringContaining('overflow-y-auto'),
      title: 'gallery.storageManager.title',
    })
  );
  expect(container?.textContent).toContain('gallery.storageManager.readyTitle');
  expect(container?.textContent).toContain('gallery.storageManager.groupsCounter');
  expect(container?.textContent).toContain('capture.png');
  expect(container?.textContent).not.toContain(emptyGroup.title);
  expect(container?.textContent).not.toContain('gallery.storageManager.empty');
  expect(container?.textContent).toContain('date:1');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onRun).toHaveBeenCalledWith(populatedGroup);
});

it('renders an empty state when every cleanup group is empty', () => {
  const onClose = vi.fn();
  const onRun = vi.fn(async () => undefined);
  const emptyReport = {
    groups: [createCleanupGroup({ items: [], potentialBytes: 0 })],
    potentialBytes: 0,
  };

  act(() => {
    root?.render(
      <StorageManagerModalContent report={emptyReport} onClose={onClose} onRun={onRun} />
    );
  });

  const deleteButtons = Array.from(container?.querySelectorAll('button') ?? []).filter((button) =>
    button.textContent?.includes('gallery.storageManager.deleteGroup')
  );

  expect(container?.textContent).toContain('gallery.storageManager.empty');
  expect(container?.textContent).not.toContain('gallery.storageManager.readyTitle');
  expect(deleteButtons).toHaveLength(0);
});
