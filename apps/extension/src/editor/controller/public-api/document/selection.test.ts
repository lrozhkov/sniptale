import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorSelectionSettings: vi.fn(),
  previewEditorSelectionSettings: vi.fn(),
}));
vi.mock('../../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-actions')>()),
  applyEditorSelectionSettings: mocks.applyEditorSelectionSettings,
}));
vi.mock('../../public-actions/selection/objects/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-actions/selection/objects/settings')>()),
  previewEditorSelectionSettings: mocks.previewEditorSelectionSettings,
}));

import {
  applyEditorSelectionSettingsViaController,
  previewEditorSelectionSettingsViaController,
} from './selection';

beforeEach(() => vi.clearAllMocks());

function controller() {
  return {
    canvas: { id: 'canvas' },
    commitHistory: vi.fn(),
    prepareObject: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: vi.fn((callback: () => unknown) => callback()),
  };
}

it('adapts apply callbacks to the controller selection owner', () => {
  const owner = controller();
  Reflect.apply(applyEditorSelectionSettingsViaController, null, [owner]);
  const args = mocks.applyEditorSelectionSettings.mock.calls[0]?.[0];
  expect(args).toBeDefined();
  const object = { id: 'object' };
  args?.prepareObject(object);
  args?.withHistoryMuted(() => 'muted');
  args?.commitHistory();
  args?.syncRuntimeState();
  expect(owner.prepareObject).toHaveBeenCalledWith(object);
  expect(owner.withHistoryMuted).toHaveBeenCalledOnce();
  expect(owner.commitHistory).toHaveBeenCalledOnce();
  expect(owner.syncRuntimeState).toHaveBeenCalledOnce();
});

it('adapts preview callbacks without exposing a history commit', () => {
  const owner = controller();
  Reflect.apply(previewEditorSelectionSettingsViaController, null, [owner]);
  const args = mocks.previewEditorSelectionSettings.mock.calls[0]?.[0];
  const object = { id: 'object' };
  args?.prepareObject(object);
  args?.withHistoryMuted(() => 'muted');
  args?.syncRuntimeState();
  expect(owner.prepareObject).toHaveBeenCalledWith(object);
  expect(owner.withHistoryMuted).toHaveBeenCalledOnce();
  expect(owner.syncRuntimeState).toHaveBeenCalledOnce();
});
