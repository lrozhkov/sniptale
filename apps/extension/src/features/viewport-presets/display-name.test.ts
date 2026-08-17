import { expect, it, vi } from 'vitest';
import type { SystemViewportPreset, UserViewportPreset } from './contracts';

const translateMock = vi.hoisted(() => vi.fn((key: string, locale?: string) => `${locale}:${key}`));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: translateMock,
}));

import { getViewportPresetDisplayName } from './display-name';

const systemPreset: SystemViewportPreset = {
  catalogRevision: 3,
  customized: false,
  enabled: true,
  height: 720,
  id: 'system:viewport-hd',
  kind: 'system',
  order: 0,
  systemKey: 'windowHd',
  target: 'window',
  width: 1280,
};
const userPreset: UserViewportPreset = {
  enabled: true,
  height: 720,
  id: 'user-1',
  kind: 'user',
  name: 'My viewport',
  order: 0,
  target: 'window',
  width: 1280,
};

it('keeps custom user and system override names verbatim', () => {
  expect(getViewportPresetDisplayName(userPreset, 'ru')).toBe('My viewport');
  expect(getViewportPresetDisplayName({ ...systemPreset, nameOverride: 'My HD' }, 'en')).toBe(
    'My HD'
  );
  expect(translateMock).not.toHaveBeenCalled();
});

it('localizes untouched system names by stable system key', () => {
  expect(getViewportPresetDisplayName(systemPreset, 'ru')).toBe(
    'ru:viewportPresets.systemNames.windowHd'
  );
  expect(translateMock).toHaveBeenCalledWith('viewportPresets.systemNames.windowHd', 'ru');
});

it('uses safe readable fallbacks for incomplete transfer metadata', () => {
  expect(getViewportPresetDisplayName({ kind: 'user' }, 'en')).toBe('');
  expect(
    getViewportPresetDisplayName({ kind: 'system', systemKey: 'future-system-preset' }, 'en')
  ).toBe('future-system-preset');
  expect(getViewportPresetDisplayName({ kind: 'system' }, 'en')).toBe('');
});
