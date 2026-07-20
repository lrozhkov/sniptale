// @vitest-environment jsdom

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CommandPaletteAction } from './types';

const storageMocks = vi.hoisted(() => ({
  loadRecentCommandPaletteActionIdsMock: vi.fn(),
  saveRecentCommandPaletteActionIdsMock: vi.fn(),
}));

vi.mock('../../composition/persistence/command-palette', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/command-palette')>()),
  loadRecentCommandPaletteActionIds: storageMocks.loadRecentCommandPaletteActionIdsMock,
  saveRecentCommandPaletteActionIds: storageMocks.saveRecentCommandPaletteActionIdsMock,
}));

import {
  useCommandPaletteController,
  useCommandPaletteKeyDown,
  useCommandPaletteSelectAction,
} from './controller';

let container: HTMLDivElement | null = null;
let latestKeyDownHandler: ReturnType<typeof useCommandPaletteKeyDown> | null = null;
let latestSelectedIndex = 0;
let root: Root | null = null;

function createAction(
  id: string,
  overrides: Partial<CommandPaletteAction> = {}
): CommandPaletteAction {
  return {
    id,
    onSelect: vi.fn(),
    title: id,
    ...overrides,
  };
}

function KeyDownHarness(props: {
  actions: readonly CommandPaletteAction[];
  isOpen?: boolean;
  onClose: () => void;
  storageKey?: string;
}) {
  const controller = useCommandPaletteController(
    props.actions,
    props.isOpen ?? true,
    props.storageKey
  );
  const handleSelectAction = useCommandPaletteSelectAction({
    onClose: props.onClose,
    recentActionIds: controller.recentActionIds,
    setRecentActionIds: controller.setRecentActionIds,
    storageKey: props.storageKey,
  });
  const handleKeyDown = useCommandPaletteKeyDown({
    flatActions: controller.flatActions,
    onClose: props.onClose,
    onSelectAction: (action) => {
      void handleSelectAction(action);
    },
    selectedIndex: controller.selectedIndex,
    setSelectedIndex: controller.setSelectedIndex,
  });

  latestKeyDownHandler = handleKeyDown;
  latestSelectedIndex = controller.selectedIndex;

  return <input ref={controller.inputRef} />;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderHarness(
  props: {
    actions?: readonly CommandPaletteAction[];
    isOpen?: boolean;
    onClose?: () => void;
    storageKey?: string;
  } = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  const nextProps = {
    actions: [createAction('open-settings'), createAction('open-gallery')],
    isOpen: true,
    onClose: vi.fn(),
    storageKey: 'palette-recents',
    ...props,
  };

  await act(async () => {
    root?.render(<KeyDownHarness {...nextProps} />);
  });
  await flushEffects();

  return nextProps;
}

function getKeyDownHandler() {
  if (!latestKeyDownHandler) {
    throw new Error('Keydown handler is not ready');
  }

  return latestKeyDownHandler;
}

function createKeyboardEvent(
  key: string,
  overrides: Partial<ReactKeyboardEvent<HTMLDivElement>> = {}
): ReactKeyboardEvent<HTMLDivElement> {
  return {
    key,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as ReactKeyboardEvent<HTMLDivElement>;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storageMocks.loadRecentCommandPaletteActionIdsMock.mockReset();
  storageMocks.saveRecentCommandPaletteActionIdsMock.mockReset();
  storageMocks.loadRecentCommandPaletteActionIdsMock.mockResolvedValue([]);
  storageMocks.saveRecentCommandPaletteActionIdsMock.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestKeyDownHandler = null;
  latestSelectedIndex = 0;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('handles navigation, selection, and close shortcuts', async () => {
  const onClose = vi.fn();
  const onSelect = vi.fn().mockResolvedValue(undefined);
  const actions = [createAction('open-settings', { onSelect }), createAction('open-gallery')];

  await renderHarness({ actions, onClose });

  const arrowDown = createKeyboardEvent('ArrowDown');
  act(() => {
    getKeyDownHandler()(arrowDown);
  });
  expect(arrowDown.preventDefault).toHaveBeenCalled();
  expect(latestSelectedIndex).toBe(1);

  const arrowUp = createKeyboardEvent('ArrowUp');
  act(() => {
    getKeyDownHandler()(arrowUp);
  });
  expect(latestSelectedIndex).toBe(0);

  const enter = createKeyboardEvent('Enter');
  await act(async () => {
    getKeyDownHandler()(enter);
    await Promise.resolve();
  });
  expect(enter.preventDefault).toHaveBeenCalled();
  expect(onSelect).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();

  const escape = createKeyboardEvent('Escape');
  act(() => {
    getKeyDownHandler()(escape);
  });
  expect(escape.preventDefault).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('does nothing for navigation keys when there are no actions', async () => {
  await renderHarness({ actions: [] });
  const enter = createKeyboardEvent('Enter');

  act(() => {
    getKeyDownHandler()(enter);
  });

  expect(enter.preventDefault).not.toHaveBeenCalled();
});

it('ignores unrelated keys when actions are available', async () => {
  const onClose = vi.fn();

  await renderHarness({ onClose });

  const tab = createKeyboardEvent('Tab');

  act(() => {
    getKeyDownHandler()(tab);
  });

  expect(tab.preventDefault).not.toHaveBeenCalled();
  expect(latestSelectedIndex).toBe(0);
  expect(onClose).not.toHaveBeenCalled();
  expect(container?.querySelector('input')).toBeInstanceOf(HTMLInputElement);
});
