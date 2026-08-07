// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../../../features/highlighter/style/defaults';
import {
  createHighlighterSettingsPersistenceSession,
  reconcileCurrentHighlighterSettings,
  runQueuedHighlighterMutation,
  syncHighlighterSettingsSnapshot,
} from './persistence';

function createState(session = createHighlighterSettingsPersistenceSession()) {
  const state = {
    settingsPersistenceSession: session,
    settings: createDefaultHighlighterSettings(),
    setSettings(value: ReturnType<typeof createDefaultHighlighterSettings> | null) {
      state.settings = value ?? createDefaultHighlighterSettings();
    },
  };
  return state;
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

it('keeps one mutation queue when a React state wrapper changes for the same session', async () => {
  const session = createHighlighterSettingsPersistenceSession();
  const firstState = createState(session);
  const wrappedState = createState(session);
  const gate = createDeferred();
  const firstMutation = vi.fn(async () => gate.promise);
  const secondMutation = vi.fn(async () => true);
  const read = vi.fn(async () => createDefaultHighlighterSettings());

  const first = runQueuedHighlighterMutation(firstState, firstMutation, read);
  const second = runQueuedHighlighterMutation(wrappedState, secondMutation, read);
  await Promise.resolve();
  expect(secondMutation).not.toHaveBeenCalled();

  gate.resolve();
  await Promise.all([first, second]);
  expect(secondMutation).toHaveBeenCalledOnce();
});

it('does not block independent settings sessions behind one another', async () => {
  const gate = createDeferred();
  const firstMutation = vi.fn(async () => gate.promise);
  const secondMutation = vi.fn(async () => true);

  const first = runQueuedHighlighterMutation(createState(), firstMutation, async () =>
    createDefaultHighlighterSettings()
  );
  const second = runQueuedHighlighterMutation(createState(), secondMutation, async () =>
    createDefaultHighlighterSettings()
  );
  await vi.waitFor(() => expect(secondMutation).toHaveBeenCalledOnce());
  gate.resolve();
  await Promise.all([first, second]);
});

it('reconciles snapshots by persistence session instead of setter identity', () => {
  const session = createHighlighterSettingsPersistenceSession();
  const state = createState(session);
  const wrapped = createState(session);
  const synced = {
    ...createDefaultHighlighterSettings(),
    defaultBorderPresetId: 'system-soft-highlight',
  };

  syncHighlighterSettingsSnapshot(session, synced);
  expect(reconcileCurrentHighlighterSettings(wrapped)).toEqual(synced);
  expect(reconcileCurrentHighlighterSettings(state)).toEqual(synced);
});
