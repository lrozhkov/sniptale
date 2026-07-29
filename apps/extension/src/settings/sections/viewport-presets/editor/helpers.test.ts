import { expect, it, vi } from 'vitest';
import type { SystemViewportPreset, UserViewportPreset } from '../../../../contracts/settings';
import {
  clampViewportDimension,
  maxViewportPresetDimension,
  resolveViewportPresetEditorTitle,
  resolveViewportPresetSubmitLabel,
  syncViewportPresetForm,
} from './helpers';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const userPreset: UserViewportPreset = {
  enabled: true,
  height: 844,
  id: 'phone',
  kind: 'user',
  name: 'Phone',
  order: 0,
  target: 'viewport',
  width: 390,
};
const systemPreset: SystemViewportPreset = {
  catalogRevision: 2,
  customized: false,
  enabled: true,
  height: 720,
  id: 'system:viewport-hd',
  kind: 'system',
  order: 0,
  systemKey: 'viewportHd',
  target: 'viewport',
  width: 1280,
};

it('clamps dimensions and resolves editor copy for create, edit, and saving states', () => {
  expect(clampViewportDimension('invalid', maxViewportPresetDimension)).toBe(1);
  expect(clampViewportDimension('0', maxViewportPresetDimension)).toBe(1);
  expect(clampViewportDimension('20000', maxViewportPresetDimension)).toBe(16384);
  expect(resolveViewportPresetEditorTitle()).toBe('viewportPresets.editor.newTitle');
  expect(resolveViewportPresetEditorTitle(userPreset)).toBe('viewportPresets.editor.editTitle');
  expect(resolveViewportPresetSubmitLabel({ isSaving: true })).toBe(
    'viewportPresets.editor.saving'
  );
  expect(resolveViewportPresetSubmitLabel({ isSaving: false })).toBe(
    'viewportPresets.editor.create'
  );
  expect(resolveViewportPresetSubmitLabel({ isSaving: false, preset: userPreset })).toBe(
    'common.actions.save'
  );
});

it('syncs user/system display names and resets a create form to defaults', () => {
  const setLabel = vi.fn();
  const setWidth = vi.fn();
  const setHeight = vi.fn();

  syncViewportPresetForm(systemPreset, setLabel, setWidth, setHeight);
  expect(setLabel).toHaveBeenCalledWith('viewportPresets.systemNames.viewportHd');
  expect(setWidth).toHaveBeenCalledWith(1280);
  expect(setHeight).toHaveBeenCalledWith(720);

  vi.clearAllMocks();
  syncViewportPresetForm(undefined, setLabel, setWidth, setHeight);
  expect(setLabel).toHaveBeenCalledWith('');
  expect(setWidth).toHaveBeenCalledWith(1280);
  expect(setHeight).toHaveBeenCalledWith(720);
});
