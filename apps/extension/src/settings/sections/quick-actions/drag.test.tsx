// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { QuickAction } from '../../../contracts/settings';

const dragMocks = vi.hoisted(() => ({
  saveQuickActionsMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal()),
  saveQuickActions: dragMocks.saveQuickActionsMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
  }),
}));

import { type QuickActionsDragEvent, useQuickActionsDrag } from './drag';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof useQuickActionsDrag> | null = null;

function createQuickAction(id: string): QuickAction {
  return {
    afterCapture: 'download_default',
    bundledId: null,
    delay: null,
    emulation: 'native',
    exitAfterCapture: false,
    hotkey: null,
    icon: 'Camera',
    id,
    imageFormat: null,
    imageQuality: null,
    name: id,
    origin: 'user',
    screenshotMode: 'visible',
    status: true,
  };
}

function DragHarness(props: {
  actions: QuickAction[];
  draggedId: string | null;
  setActions: (actions: QuickAction[]) => void;
  setDraggedId: (value: string | null) => void;
  setDragOverId: (value: string | null) => void;
}) {
  latestValue = useQuickActionsDrag(props);
  return null;
}

async function renderHarness(props: React.ComponentProps<typeof DragHarness>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<DragHarness {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  dragMocks.saveQuickActionsMock.mockReset();
  dragMocks.saveQuickActionsMock.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestValue = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('tracks drag state and reorders quick actions on drop', async () => {
  const setActions = vi.fn();
  const setDraggedId = vi.fn();
  const setDragOverId = vi.fn();
  const first = createQuickAction('action-1');
  const second = createQuickAction('action-2');
  const dragEvent = {
    dataTransfer: {
      dropEffect: 'none',
      effectAllowed: 'none',
      setData: vi.fn(),
    },
    preventDefault: vi.fn(),
  } satisfies QuickActionsDragEvent;

  await renderHarness({
    actions: [first, second],
    draggedId: null,
    setActions,
    setDraggedId,
    setDragOverId,
  });

  act(() => {
    latestValue?.handleDragStart(dragEvent, 'action-1');
    latestValue?.handleDragOver(dragEvent, 'action-2');
  });

  expect(setDraggedId).toHaveBeenCalledWith('action-1');
  expect(setDragOverId).toHaveBeenCalledWith('action-2');
  expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'action-1');

  await renderHarness({
    actions: [first, second],
    draggedId: 'action-1',
    setActions,
    setDraggedId,
    setDragOverId,
  });

  await act(async () => {
    await latestValue?.handleDrop(dragEvent, 'action-2');
  });

  expect(dragMocks.saveQuickActionsMock).toHaveBeenCalledWith([second, first]);
  expect(setActions).toHaveBeenCalledWith([second, first]);
  expect(setDraggedId).toHaveBeenLastCalledWith(null);
  expect(setDragOverId).toHaveBeenLastCalledWith(null);
});
