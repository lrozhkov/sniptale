// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../../features/highlighter/style/defaults';
import {
  createHighlighterSettingsPersistenceSession,
  runQueuedHighlighterMutation,
} from './persistence';

function createState() {
  const state = {
    settingsPersistenceSession: createHighlighterSettingsPersistenceSession(),
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

it('serializes owner mutations and commits only the confirmed reread state', async () => {
  const state = createState();
  let persisted = createDefaultHighlighterSettings();
  const firstGate = createDeferred();
  const firstMutation = vi.fn(async () => {
    await firstGate.promise;
    persisted = { ...persisted, defaultEffectMode: 'blur' };
    return true;
  });
  const secondMutation = vi.fn(async () => {
    persisted = { ...persisted, defaultBorderPresetId: 'system-soft-highlight' };
    return true;
  });
  const read = vi.fn(async () => persisted);

  const first = runQueuedHighlighterMutation(state, firstMutation, read);
  const second = runQueuedHighlighterMutation(state, secondMutation, read);
  await vi.waitFor(() => expect(firstMutation).toHaveBeenCalledOnce());
  expect(secondMutation).not.toHaveBeenCalled();

  firstGate.resolve();
  await first;
  await second;

  expect(state.settings).toMatchObject({
    defaultEffectMode: 'blur',
    defaultBorderPresetId: 'system-soft-highlight',
  });
  expect(read).toHaveBeenCalledTimes(2);
});

it('rereads and syncs authoritative state when the owner rejects a guarded mutation', async () => {
  const state = createState();
  const authoritative = {
    ...createDefaultHighlighterSettings(),
    defaultBorderPresetId: 'system-soft-highlight',
  };

  const result = await runQueuedHighlighterMutation(
    state,
    async () => false,
    async () => authoritative
  );

  expect(result).toEqual({
    applied: false,
    outcome: 'rejected',
    settings: authoritative,
  });
  expect(state.settings).toEqual(authoritative);
});
