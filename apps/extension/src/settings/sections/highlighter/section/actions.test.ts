// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { BorderPreset } from '../../../../features/highlighter/contracts';
import { createDefaultHighlighterSettings } from '../../../../features/highlighter/style/defaults';
import { createHighlighterCrudActions } from './crud-actions';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  delete: vi.fn(),
  load: vi.fn(),
  reset: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  addBorderPresetWithOutcome: mocks.add,
  deleteBorderPreset: mocks.delete,
  loadHighlighterSettings: mocks.load,
  resetSystemBorderPreset: mocks.reset,
  updateBorderPresetWithOutcome: mocks.update,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

function createUserPreset(id: string): BorderPreset {
  const {
    basedOnRevision: _basedOnRevision,
    customized: _customized,
    systemPresetKey: _systemPresetKey,
    ...base
  } = createDefaultHighlighterSettings().borderPresets[0]!;
  return {
    ...base,
    id,
    name: id,
    origin: 'user',
  };
}

function createState() {
  const state = {
    editingPreset: undefined as BorderPreset | undefined,
    isEditorOpen: false,
    settingsPersistenceSession: {},
    settings: createDefaultHighlighterSettings(),
    setEditingPreset(value: BorderPreset | undefined) {
      state.editingPreset = value;
    },
    setIsEditorOpen(value: boolean) {
      state.isEditorOpen = value;
    },
    setSettings(value: ReturnType<typeof createDefaultHighlighterSettings> | null) {
      if (value) state.settings = value;
    },
  };
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.add.mockResolvedValue('applied');
  mocks.delete.mockResolvedValue(true);
  mocks.reset.mockResolvedValue(true);
  mocks.update.mockResolvedValue('applied');
});

it('edits system presets and physically deletes only user presets', async () => {
  const state = createState();
  const system = state.settings.borderPresets[0]!;
  const user = createUserPreset('user-1');
  state.settings.borderPresets.push(user);
  mocks.load.mockImplementation(async () => state.settings);
  const actions = createHighlighterCrudActions(state);

  actions.handleEditPreset(system);
  expect(state.editingPreset).toBe(system);
  expect(state.isEditorOpen).toBe(true);

  await actions.handleDeletePreset(system);
  expect(mocks.delete).not.toHaveBeenCalled();

  await actions.handleDeletePreset(user);
  expect(mocks.delete).toHaveBeenCalledWith('user-1');
});

it('delegates create, update, and reset to canonical owner commands', async () => {
  const state = createState();
  const user = createUserPreset('user-1');
  mocks.load.mockImplementation(async () => state.settings);
  const actions = createHighlighterCrudActions(state);

  await actions.handleSavePreset(user);
  expect(mocks.add).toHaveBeenCalledWith(user);

  state.settings.borderPresets.push(user);
  await actions.handleSavePreset({ ...user, name: 'Updated' });
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated' }));

  await actions.handleResetPreset('system-default');
  expect(mocks.reset).toHaveBeenCalledWith('system-default');
});

it('surfaces mutation failures without closing the editor', async () => {
  const state = createState();
  state.isEditorOpen = true;
  mocks.add.mockRejectedValue(new Error('failed'));
  const actions = createHighlighterCrudActions(state);

  await actions.handleSavePreset(createUserPreset('user-1'));

  expect(state.isEditorOpen).toBe(true);
  expect(mocks.toastError).toHaveBeenCalledWith(
    'common.states.errorhighlighter.section.saveErrorSuffix'
  );
});

it('keeps the editor open when the mutation owner rejects the draft', async () => {
  const state = createState();
  state.isEditorOpen = true;
  mocks.add.mockResolvedValue('rejected');
  mocks.load.mockImplementation(async () => state.settings);
  const actions = createHighlighterCrudActions(state);

  await actions.handleSavePreset(createUserPreset('user-1'));

  expect(state.isEditorOpen).toBe(true);
  expect(mocks.toastSuccess).not.toHaveBeenCalled();
});
