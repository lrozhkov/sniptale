import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  deletePreset: vi.fn(),
  makeDefault: vi.fn(),
  reorder: vi.fn(),
  toggle: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('../../../../../composition/persistence/editor-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/editor-presets')
  >()),
  deleteEditorPreset: mocks.deletePreset,
  setDefaultEditorPreset: mocks.makeDefault,
  setEditorPresetEnabled: mocks.toggle,
  updateEditorPresetOrder: mocks.reorder,
}));
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ toast: { error: mocks.toast } }));
import { createToolPresetActions } from './actions';
beforeEach(() => vi.clearAllMocks());
it('routes tool deletion and reorder to the existing persistence owner', async () => {
  const actions = createToolPresetActions({
    currentPresets: [{ id: 'a' }, { id: 'b' }],
    owner: 'pencil',
  });
  await actions.deletePreset('a');
  await actions.movePreset('a', null);
  expect(mocks.deletePreset).toHaveBeenCalledWith('pencil', 'a');
  expect(mocks.reorder).toHaveBeenCalledWith('pencil', ['b', 'a']);
});

it('routes toggle/default actions, suppresses invalid moves, and surfaces persistence failures', async () => {
  mocks.toggle.mockRejectedValueOnce(new Error('failed'));
  const actions = createToolPresetActions({
    currentPresets: [{ id: 'a' }, { id: 'b' }],
    owner: 'pencil',
  });
  await actions.makeDefault('b');
  await actions.togglePreset('a', false);
  await actions.movePreset('missing', null);
  expect(mocks.makeDefault).toHaveBeenCalledWith('pencil', 'b');
  expect(mocks.toggle).toHaveBeenCalledWith('pencil', 'a', false);
  expect(mocks.toast).toHaveBeenCalledWith('common.states.error');
  expect(mocks.reorder).not.toHaveBeenCalled();
});
