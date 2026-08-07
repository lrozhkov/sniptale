// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../../../features/highlighter/style/defaults';
import { createHighlighterDragActions } from './drag-actions';
import { createHighlighterSettingsActions } from './persistence-actions';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  reorder: vi.fn(),
  saveBlur: vi.fn(),
}));

vi.mock('../../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  loadHighlighterSettings: mocks.load,
  saveDefaultBlurSettings: mocks.saveBlur,
  updateBorderPresetsOrder: mocks.reorder,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

it('keeps the drop command queued behind an in-flight settings mutation', async () => {
  const settings = createDefaultHighlighterSettings();
  const state = {
    draggedId: null as string | null,
    dragOverId: null as string | null,
    settingsPersistenceSession: {},
    settings,
    setDraggedId(value: string | null) {
      state.draggedId = value;
    },
    setDragOverId(value: string | null) {
      state.dragOverId = value;
    },
    setSettings(value: typeof settings | null) {
      if (value) state.settings = value;
    },
  };
  const gate = createDeferred();
  mocks.saveBlur.mockImplementation(async () => {
    await gate.promise;
    return true;
  });
  mocks.reorder.mockResolvedValue(true);
  mocks.load.mockResolvedValue(settings);
  const settingsActions = createHighlighterSettingsActions(state);
  const dragActions = createHighlighterDragActions(state);
  const event = { dataTransfer: { effectAllowed: 'none' }, preventDefault: vi.fn() };

  const blur = settingsActions.handleUpdateBlurSettings({
    amount: 7,
    blurType: 'solid',
    showBorder: true,
  });
  dragActions.handleDragStart(event, 'system-default');
  const drop = dragActions.handleDrop(event, 'system-soft-highlight');
  await Promise.resolve();
  expect(mocks.reorder).not.toHaveBeenCalled();

  gate.resolve();
  await Promise.all([blur, drop]);
  expect(mocks.reorder).toHaveBeenCalledOnce();
});

it('keeps drag hover narrow and resets no-op drops without persisting', async () => {
  const settings = createDefaultHighlighterSettings();
  const state = {
    draggedId: null as string | null,
    dragOverId: null as string | null,
    settingsPersistenceSession: {},
    settings,
    setDraggedId(value: string | null) {
      state.draggedId = value;
    },
    setDragOverId(value: string | null) {
      state.dragOverId = value;
    },
    setSettings(value: typeof settings | null) {
      if (value) state.settings = value;
    },
  };
  const actions = createHighlighterDragActions(state);
  const event = { dataTransfer: { effectAllowed: 'none' }, preventDefault: vi.fn() };

  actions.handleDragOver(event, 'system-soft-highlight');
  expect(state.dragOverId).toBeNull();

  actions.handleDragStart(event, 'system-default');
  actions.handleDragOver(event, 'system-default');
  expect(state.dragOverId).toBeNull();
  actions.handleDragOver(event, 'system-soft-highlight');
  expect(state.dragOverId).toBe('system-soft-highlight');

  await actions.handleDrop(event, 'system-default');
  expect(mocks.reorder).not.toHaveBeenCalled();
  expect(state.draggedId).toBeNull();
  expect(state.dragOverId).toBeNull();
});
