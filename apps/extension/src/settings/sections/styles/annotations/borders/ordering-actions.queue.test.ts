// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../../../features/highlighter/style/defaults';
import { createHighlighterOrderingActions } from './ordering-actions';
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

it('keeps the reorder command queued behind an in-flight settings mutation', async () => {
  const settings = createDefaultHighlighterSettings();
  const state = {
    settingsPersistenceSession: {},
    settings,
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
  const orderingActions = createHighlighterOrderingActions(state);

  const blur = settingsActions.handleUpdateBlurSettings({
    amount: 7,
    blurType: 'solid',
    showBorder: true,
  });
  const move = orderingActions.handleMoveBefore('system-default', null);
  await Promise.resolve();
  expect(mocks.reorder).not.toHaveBeenCalled();

  gate.resolve();
  await Promise.all([blur, move]);
  expect(mocks.reorder).toHaveBeenCalledOnce();
});

it('ignores invalid move anchors without persisting', async () => {
  const settings = createDefaultHighlighterSettings();
  const state = {
    settingsPersistenceSession: {},
    settings,
    setSettings(value: typeof settings | null) {
      if (value) state.settings = value;
    },
  };
  const actions = createHighlighterOrderingActions(state);
  await actions.handleMoveBefore('system-default', 'missing');
  expect(mocks.reorder).not.toHaveBeenCalled();
});
