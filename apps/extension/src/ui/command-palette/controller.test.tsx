// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import { useCommandPaletteController, useCommandPaletteSelectAction } from './controller';
type ControllerState = ReturnType<typeof useCommandPaletteController>;
let latestControllerState: ControllerState | null = null;
let latestSelectActionHandler: ReturnType<typeof useCommandPaletteSelectAction> | null = null;
let container: HTMLDivElement | null = null,
  root: Root | null = null;
function createAction(
  id: string,
  overrides: Partial<CommandPaletteAction> = {}
): CommandPaletteAction {
  return { id, onSelect: vi.fn(), title: id, ...overrides };
}
const BASE_ACTIONS: CommandPaletteAction[] = [
  createAction('open-settings', {
    keywords: ['preferences'],
    section: 'navigation',
    shortcut: 'Ctrl+,',
    subtitle: 'Open settings page',
    title: 'Open settings',
  }),
  createAction('open-gallery', {
    keywords: ['media'],
    section: 'navigation',
    title: 'Open gallery',
  }),
  createAction('start-recording', {
    keywords: ['video', 'capture'],
    section: 'capture',
    title: 'Start recording',
  }),
];
function ControllerHarness(props: {
  actions: readonly CommandPaletteAction[];
  isOpen: boolean;
  storageKey?: string;
  onClose?: () => void;
}) {
  const controller = useCommandPaletteController(props.actions, props.isOpen, props.storageKey);
  const handleSelectAction = useCommandPaletteSelectAction({
    onClose: props.onClose ?? (() => undefined),
    recentActionIds: controller.recentActionIds,
    setRecentActionIds: controller.setRecentActionIds,
    storageKey: props.storageKey,
  });

  latestControllerState = controller;
  latestSelectActionHandler = handleSelectAction;
  return <input ref={controller.inputRef} data-testid="palette-input" />;
}
async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function renderHarness(
  props: {
    actions?: readonly CommandPaletteAction[];
    isOpen?: boolean;
    storageKey?: string;
    onClose?: () => void;
  } = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  const nextProps = {
    actions: BASE_ACTIONS,
    isOpen: true,
    onClose: vi.fn(),
    storageKey: 'palette-recents',
    ...props,
  };

  await act(async () => {
    root?.render(<ControllerHarness {...nextProps} />);
  });
  await flushEffects();

  return nextProps;
}
function getControllerState() {
  if (!latestControllerState) {
    throw new Error('Controller state is not ready');
  }
  return latestControllerState;
}
function getSelectActionHandler() {
  if (!latestSelectActionHandler) {
    throw new Error('Select action handler is not ready');
  }
  return latestSelectActionHandler;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  storageMocks.loadRecentCommandPaletteActionIdsMock.mockResolvedValue([]);
  storageMocks.saveRecentCommandPaletteActionIdsMock.mockResolvedValue(undefined);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestControllerState = null;
  latestSelectActionHandler = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function verifiesOpenStateHydration() {
  storageMocks.loadRecentCommandPaletteActionIdsMock.mockResolvedValueOnce([
    'open-gallery',
    'open-settings',
  ]);
  const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');

  await renderHarness();

  expect(getControllerState().query).toBe('');
  expect(getControllerState().selectedIndex).toBe(0);
  expect(getControllerState().flatActionIds).toEqual([
    'open-gallery',
    'open-settings',
    'start-recording',
  ]);
  expect(getControllerState().groups).toEqual([
    expect.objectContaining({
      id: 'recent',
      label: 'shared.ui.commandPaletteRecentSection',
    }),
    expect.objectContaining({
      id: 'all',
      label: 'shared.ui.commandPaletteAllSection',
    }),
  ]);
  expect(focusSpy).toHaveBeenCalled();
  expect(getControllerState().inputRef.current).toBeInstanceOf(HTMLInputElement);
  expect(storageMocks.loadRecentCommandPaletteActionIdsMock).toHaveBeenCalledWith(
    'palette-recents'
  );
}
async function verifiesSelectionClampAfterQueryChange() {
  await renderHarness();

  act(() => {
    getControllerState().setSelectedIndex(2);
    getControllerState().setQuery('settings');
  });
  await flushEffects();

  expect(getControllerState().flatActionIds).toEqual(['open-settings']);
  expect(getControllerState().groups).toEqual([
    expect.objectContaining({
      id: 'results',
      label: 'shared.ui.commandPaletteResultsSection',
    }),
  ]);
  expect(getControllerState().selectedIndex).toBe(0);
}
async function verifiesLateHydrationDoesNotOverwriteSelection() {
  const deferredLoad = createDeferredPromise<string[]>();
  const onSelect = vi.fn().mockResolvedValue(undefined);
  storageMocks.loadRecentCommandPaletteActionIdsMock.mockReturnValueOnce(deferredLoad.promise);

  await renderHarness();
  await act(async () => {
    await getSelectActionHandler()(createAction('open-settings', { onSelect }));
  });

  deferredLoad.resolve(['open-gallery']);
  await flushEffects();

  expect(getControllerState().flatActionIds[0]).toBe('open-settings');
  expect(storageMocks.saveRecentCommandPaletteActionIdsMock).toHaveBeenCalledWith(
    'palette-recents',
    ['open-settings']
  );
}

async function verifiesSelectionRecordingSuccess() {
  const onClose = vi.fn();
  const onSelect = vi.fn().mockResolvedValue(undefined);
  const action = createAction('open-settings', { onSelect });

  await renderHarness({ onClose });
  await act(async () => {
    await getSelectActionHandler()(action);
  });
  expect(onSelect).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
  expect(getControllerState().flatActionIds[0]).toBe('open-settings');
  expect(storageMocks.saveRecentCommandPaletteActionIdsMock).toHaveBeenCalledWith(
    'palette-recents',
    ['open-settings']
  );
}

async function verifiesSelectionRollbackOnSaveFailure() {
  const onClose = vi.fn();
  const action = createAction('open-settings', {
    onSelect: vi.fn().mockResolvedValue(undefined),
  });

  storageMocks.loadRecentCommandPaletteActionIdsMock.mockResolvedValueOnce(['open-gallery']);
  storageMocks.saveRecentCommandPaletteActionIdsMock.mockRejectedValueOnce(
    new Error('save failed')
  );

  await renderHarness({ onClose });
  await expect(
    act(async () => {
      await getSelectActionHandler()(action);
    })
  ).rejects.toThrow('save failed');
  expect(getControllerState().flatActionIds[0]).toBe('open-gallery');
  expect(onClose).not.toHaveBeenCalled();
  expect(action.onSelect).not.toHaveBeenCalled();
}

describe('useCommandPaletteController open state', () => {
  it(
    'loads recent actions, resets query and focuses the input when opened',
    verifiesOpenStateHydration
  );
  it(
    'filters actions by query and clamps selection when the result set shrinks',
    verifiesSelectionClampAfterQueryChange
  );
  it(
    'does not let late recent-action hydration overwrite a user selection',
    verifiesLateHydrationDoesNotOverwriteSelection
  );
});

describe('useCommandPaletteSelectAction', () => {
  it(
    'records recent actions, awaits selection, and closes the palette',
    verifiesSelectionRecordingSuccess
  );
  it(
    'rolls back optimistic recents when persistence fails',
    verifiesSelectionRollbackOnSaveFailure
  );
  it('ignores undefined and disabled actions', async () => {
    const onClose = vi.fn();
    const disabledAction = createAction('open-gallery', {
      disabled: true,
      onSelect: vi.fn(),
    });

    await renderHarness({ onClose });
    await act(async () => {
      await getSelectActionHandler()(undefined);
      await getSelectActionHandler()(disabledAction);
    });

    expect(disabledAction.onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
