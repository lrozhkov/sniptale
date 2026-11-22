// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi, beforeAll } from 'vitest';
import {
  loadSettingsCatalogFixture,
  prepareSettingsTranslations,
} from '../../../../catalog-fixture.test-support';
import type { useAudioPresets } from '../../../../../composition/audio-preset-resources/use-audio-presets';
import { listBuiltInAudioPresets } from '../../../../../features/video/audio/effects/presets';
import { parseAudioPresetCatalog } from '../../../../../composition/persistence/audio-presets/catalog';

type Resources = Pick<
  ReturnType<typeof useAudioPresets>,
  | 'records'
  | 'catalog'
  | 'busy'
  | 'canWrite'
  | 'error'
  | 'rename'
  | 'remove'
  | 'setDefault'
  | 'toggle'
  | 'reset'
  | 'exportPreset'
  | 'reload'
  | 'importFile'
>;
let state: Resources;
vi.mock('../../../../../composition/audio-preset-resources/use-audio-presets', () => ({
  useAudioPresets: () => state,
}));
import { AudioPresetsSettings } from './view';
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  document.body.append(host);
  root = createRoot(host);
  const preset = listBuiltInAudioPresets()[0]!.preset;
  state = {
    records: [
      {
        id: 'builtin:speech',
        name: 'Speech',
        preset,
        isUser: false,
        unavailable: false,
        enabled: true,
        isDefault: true,
      },
      {
        id: 'user-a',
        name: 'Custom',
        preset,
        isUser: true,
        unavailable: false,
        enabled: true,
        isDefault: false,
      },
    ],
    catalog: parseAudioPresetCatalog(undefined),
    busy: false,
    canWrite: true,
    error: null,
    rename: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    setDefault: vi.fn(async () => true),
    toggle: vi.fn(async () => true),
    reset: vi.fn(async () => true),
    exportPreset: vi.fn(),
    reload: vi.fn(async () => {}),
    importFile: vi.fn(async () => true),
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});
it('protects the default preset from disabling and allows source-only export', () => {
  act(() => root.render(<AudioPresetsSettings />));
  const builtin = host.querySelector('[data-settings-collection-item="builtin:speech"]')!;
  expect(builtin.querySelector<HTMLButtonElement>('[aria-label="Выключить"]')?.disabled).toBe(true);
  act(() => builtin.querySelector<HTMLButtonElement>('[aria-label="Скачать пресет"]')?.click());
  expect(state.exportPreset).toHaveBeenCalledWith('builtin:speech');
  expect(state.toggle).not.toHaveBeenCalled();
});
it('keeps readable builtins during catalogue load failure and restricts only catalogue mutations', () => {
  state = { ...state, canWrite: false, catalog: null, error: 'load' };
  act(() => root.render(<AudioPresetsSettings />));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.textContent).toContain('Speech');
  const user = host.querySelector('[data-settings-collection-item="user-a"]')!;
  expect(user.querySelector<HTMLButtonElement>('[aria-label="Редактировать"]')?.disabled).toBe(
    true
  );
  expect(user.querySelector<HTMLButtonElement>('[aria-label="Выключить"]')?.disabled).toBe(true);
  const download = user.querySelector<HTMLButtonElement>('[aria-label="Скачать пресет"]')!;
  expect(download.disabled).toBe(false);
  act(() => download.click());
  expect(state.exportPreset).toHaveBeenCalledWith('user-a');
});
it('submits an opened rename through its original catalogue basis after an external update', async () => {
  act(() => root.render(<AudioPresetsSettings />));
  const original = state.rename;
  act(() =>
    host
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="user-a"] [aria-label="Редактировать"]'
      )!
      .click()
  );
  const replacement = vi.fn(async () => true);
  state = { ...state, rename: replacement };
  act(() => root.render(<AudioPresetsSettings />));
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Сохранить пресет"]')!.click()
  );
  expect(original).toHaveBeenCalledWith('user-a', 'Custom');
  expect(replacement).not.toHaveBeenCalled();
});

vi.mock('../../../../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: (locale: Parameters<typeof loadSettingsCatalogFixture>[0]) =>
    loadSettingsCatalogFixture(locale),
}));

beforeAll(() => prepareSettingsTranslations('ru'));
