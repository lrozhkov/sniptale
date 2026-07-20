import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuickAction } from '../../../contracts/settings';

const { browserStorageLocalGetMock, browserStorageLocalSetMock } = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
}));

const {
  getBundledQuickActionsMock,
  isBundledQuickActionMock,
  mergeStoredQuickActionsMock,
  normalizeQuickActionMock,
  sanitizeQuickActionsDisplayModeMock,
} = vi.hoisted(() => ({
  getBundledQuickActionsMock: vi.fn(),
  isBundledQuickActionMock: vi.fn(),
  mergeStoredQuickActionsMock: vi.fn(),
  normalizeQuickActionMock: vi.fn(),
  sanitizeQuickActionsDisplayModeMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  BrowserStorageAdapter: undefined,
  BrowserStorageAreaAdapter: undefined,
  BrowserStorageChangeListener: undefined,
  BrowserStorageChanges: undefined,
  BrowserStorageGetKeys: undefined,
  BrowserStorageSetItems: undefined,
  browserStorage: {
    local: {
      get: browserStorageLocalGetMock,
      set: browserStorageLocalSetMock,
    },
  },
}));

vi.mock('../../../features/quick-actions-presets/catalog', () => ({
  createBundledQuickAction: vi.fn(),
  getBundledQuickActionConfig: vi.fn(),
  getBundledQuickActions: getBundledQuickActionsMock,
  getQuickActionDisplayName: vi.fn(),
  isBundledQuickAction: isBundledQuickActionMock,
}));

vi.mock('../../../features/quick-actions-presets/display-mode', () => ({
  DEFAULT_QUICK_ACTIONS_DISPLAY_MODE: 'list',
  sanitizeQuickActionsDisplayMode: sanitizeQuickActionsDisplayModeMock,
}));

vi.mock('../../../features/quick-actions-presets/normalization', () => ({
  mergeStoredQuickActions: mergeStoredQuickActionsMock,
  normalizeQuickAction: normalizeQuickActionMock,
}));

import {
  addQuickAction,
  deleteQuickAction,
  getQuickActionsBootstrapData,
  getQuickActions,
  getQuickActionsDisplayMode,
  saveQuickActions,
  saveQuickActionsDisplayMode,
  updateQuickAction,
} from './index';

function createAction(id: string, origin: 'bundled' | 'user' = 'user'): QuickAction {
  return {
    id,
    status: true,
    name: `Action ${id}`,
    icon: 'Camera',
    origin,
    bundledId: origin === 'bundled' ? ('default-fullscreen' as const) : null,
    hotkey: null,
    screenshotMode: 'visible',
    emulation: 'native',
    delay: null,
    afterCapture: 'download_default',
    imageFormat: 'png',
    imageQuality: null,
    exitAfterCapture: true,
  };
}

function resetQuickActionsStorageMocks() {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const bundledActions = [createAction('bundled-1', 'bundled')];
  getBundledQuickActionsMock.mockReturnValue(bundledActions);
  normalizeQuickActionMock.mockImplementation((action: QuickAction) => action);
  mergeStoredQuickActionsMock.mockImplementation((actions: QuickAction[]) => ({
    actions,
    changed: false,
  }));
  isBundledQuickActionMock.mockReturnValue(false);
  sanitizeQuickActionsDisplayModeMock.mockImplementation((mode: unknown) =>
    mode === 'hidden' ? 'hidden' : 'list'
  );
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
}

async function verifyDefaultInitialization() {
  await expect(getQuickActions()).resolves.toEqual([createAction('bundled-1', 'bundled')]);
  expect(browserStorageLocalSetMock).not.toHaveBeenCalled();
}

async function verifyMigrationAndSaveContracts() {
  const storedActions = [createAction('stored-1')];
  const migratedActions = [createAction('stored-1'), createAction('bundled-2', 'bundled')];
  browserStorageLocalGetMock.mockResolvedValueOnce({
    sniptale_quick_actions: storedActions,
  });
  mergeStoredQuickActionsMock.mockReturnValueOnce({
    actions: migratedActions,
    changed: true,
  });

  await expect(getQuickActions()).resolves.toEqual(migratedActions);
  expect(browserStorageLocalSetMock).not.toHaveBeenCalled();

  await saveQuickActions([createAction('saved-1')]);

  expect(browserStorageLocalSetMock).toHaveBeenLastCalledWith({
    sniptale_quick_actions: [createAction('saved-1')],
  });
}

async function verifyAddUpdateDeleteFlow() {
  browserStorageLocalGetMock
    .mockResolvedValueOnce({ sniptale_quick_actions: [createAction('existing-1')] })
    .mockResolvedValueOnce({
      sniptale_quick_actions: [createAction('existing-1'), createAction('new-1')],
    })
    .mockResolvedValueOnce({
      sniptale_quick_actions: [createAction('existing-1'), createAction('new-1')],
    });

  await addQuickAction(createAction('new-1'));
  await updateQuickAction({ ...createAction('existing-1'), name: 'Updated action' });
  await deleteQuickAction('new-1');

  expect(browserStorageLocalSetMock).toHaveBeenNthCalledWith(1, {
    sniptale_quick_actions: [createAction('existing-1'), createAction('new-1')],
  });
  expect(browserStorageLocalSetMock).toHaveBeenNthCalledWith(2, {
    sniptale_quick_actions: [
      { ...createAction('existing-1'), name: 'Updated action' },
      createAction('new-1'),
    ],
  });
  expect(browserStorageLocalSetMock).toHaveBeenNthCalledWith(3, {
    sniptale_quick_actions: [createAction('existing-1')],
  });

  browserStorageLocalGetMock.mockResolvedValueOnce({
    sniptale_quick_actions: [createAction('bundled-1', 'bundled')],
  });
  isBundledQuickActionMock.mockReturnValueOnce(true);

  await deleteQuickAction('bundled-1');

  expect(browserStorageLocalSetMock).toHaveBeenCalledTimes(3);
}

async function verifyDisplayModeContracts() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  browserStorageLocalGetMock.mockResolvedValueOnce({
    sniptale_quick_actions_display_mode: 'hidden',
  });

  await expect(getQuickActionsDisplayMode()).resolves.toBe('hidden');

  const error = new Error('display mode failed');
  browserStorageLocalGetMock.mockRejectedValueOnce(error);

  await expect(getQuickActionsDisplayMode()).resolves.toBe('list');
  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedQuickActionsStorage]',
    'Failed to load quick actions display mode',
    expect.objectContaining({ message: error.message })
  );

  browserStorageLocalGetMock.mockResolvedValueOnce({
    sniptale_quick_actions_display_mode: 'invalid',
  });

  await expect(getQuickActionsDisplayMode()).resolves.toBe('list');
  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedQuickActionsStorage]',
    'Ignoring invalid quick actions display mode from storage',
    { value: 'invalid' }
  );

  await saveQuickActionsDisplayMode('hidden');

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    sniptale_quick_actions_display_mode: 'hidden',
  });
}

async function verifyBatchedBootstrapReadUsesOneStorageCall() {
  const action = createAction('batched-1');
  browserStorageLocalGetMock.mockResolvedValueOnce({
    sniptale_quick_actions: [action],
    sniptale_quick_actions_display_mode: 'hidden',
  });

  await expect(getQuickActionsBootstrapData()).resolves.toEqual({
    actions: [action],
    displayMode: 'hidden',
  });

  expect(browserStorageLocalGetMock).toHaveBeenCalledWith([
    'sniptale_quick_actions',
    'sniptale_quick_actions_display_mode',
  ]);
}

async function verifyInvalidStoredQuickActionsAreDropped() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const validAction = createAction('valid-1');

  browserStorageLocalGetMock.mockResolvedValueOnce({
    sniptale_quick_actions: ['invalid-action', validAction, { id: 'missing-fields' }],
  });

  await expect(getQuickActions()).resolves.toEqual([validAction]);

  expect(mergeStoredQuickActionsMock).toHaveBeenCalledWith([validAction]);
  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedQuickActionsStorage]',
    'Dropped invalid quick actions from storage',
    { invalidEntryCount: 2 }
  );
}

async function verifyConcurrentMutationsAreSerialized() {
  let storedActions = [createAction('existing-1')];
  browserStorageLocalGetMock.mockImplementation(async () => ({
    sniptale_quick_actions: storedActions,
  }));
  browserStorageLocalSetMock.mockImplementation(async (payload) => {
    storedActions = payload.sniptale_quick_actions;
  });

  await Promise.all([addQuickAction(createAction('new-1')), addQuickAction(createAction('new-2'))]);

  expect(storedActions.map((action) => action.id)).toEqual(['existing-1', 'new-1', 'new-2']);
}

describe('quick-actions', () => {
  beforeEach(resetQuickActionsStorageMocks);

  it('initializes bundled quick actions when storage is empty', verifyDefaultInitialization);
  it(
    'persists migrated quick actions and keeps the save contract stable',
    verifyMigrationAndSaveContracts
  );
  it('adds, updates, and deletes only user quick actions', verifyAddUpdateDeleteFlow);
  it(
    'drops invalid quick actions before applying migrations',
    verifyInvalidStoredQuickActionsAreDropped
  );
  it('serializes concurrent quick-action mutations', verifyConcurrentMutationsAreSerialized);
  it(
    'loads and saves display mode with a fallback on storage failures',
    verifyDisplayModeContracts
  );
  it(
    'loads quick-actions bootstrap data through one batched storage read',
    verifyBatchedBootstrapReadUsesOneStorageCall
  );
  it('preserves the row display mode when the sanitizer allows it', async () => {
    sanitizeQuickActionsDisplayModeMock.mockReturnValueOnce('row');
    browserStorageLocalGetMock.mockResolvedValueOnce({
      sniptale_quick_actions_display_mode: 'row',
    });

    await expect(getQuickActionsDisplayMode()).resolves.toBe('row');
  });
  it('drops invalid quick-action roots before migration runs', async () => {
    browserStorageLocalGetMock.mockResolvedValueOnce({
      sniptale_quick_actions: { broken: true },
    });

    await expect(getQuickActions()).resolves.toEqual([createAction('bundled-1', 'bundled')]);
  });
});
