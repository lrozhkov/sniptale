import { beforeEach, expect, it, vi } from 'vitest';

import type { SystemViewportPreset, UserViewportPreset } from '../../../../contracts/settings';
import {
  createViewportPreset,
  getDeleteMessage,
  moveViewportPresetBefore,
  updateViewportPreset,
} from './helpers';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const viewportPreset: UserViewportPreset = {
  enabled: true,
  height: 720,
  id: 'viewport-user',
  kind: 'user',
  name: 'Viewport',
  order: 0,
  target: 'window',
  width: 1280,
};
const secondViewportPreset: UserViewportPreset = {
  ...viewportPreset,
  id: 'viewport-user-2',
  name: 'Second viewport',
  order: 1,
};
const systemWindowPreset: SystemViewportPreset = {
  catalogRevision: 3,
  customized: false,
  enabled: true,
  height: 720,
  id: 'system:window-hd',
  kind: 'system',
  order: 0,
  systemKey: 'windowHd',
  target: 'window',
  width: 1280,
};

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'created-preset') });
});

it('updates user and system presets while preserving normalized target-group order', () => {
  const presets = [viewportPreset, secondViewportPreset, systemWindowPreset];

  expect(
    updateViewportPreset(presets, viewportPreset, {
      height: 900,
      name: '  Desktop  ',
      target: 'window',
      width: 1440,
    }).find((preset) => preset.id === viewportPreset.id)
  ).toMatchObject({ name: 'Desktop', order: 1, target: 'window' });

  expect(
    updateViewportPreset(presets, systemWindowPreset, {
      height: 800,
      name: '  Changed system  ',
      nameEdited: true,
      target: 'window',
      width: 1300,
    }).find((preset) => preset.id === systemWindowPreset.id)
  ).toMatchObject({ customized: true, nameOverride: 'Changed system', order: 0 });
});

it('does not persist a stale localized system label during a dimension-only edit', () => {
  const [updated] = updateViewportPreset([systemWindowPreset], systemWindowPreset, {
    height: 800,
    name: 'Окно HD',
    nameEdited: false,
    target: 'window',
    width: 1300,
  });

  expect(updated).toMatchObject({ customized: true, height: 800, width: 1300 });
  expect(updated).not.toHaveProperty('nameOverride');
});

it('creates presets in the next group position', () => {
  const presets = [viewportPreset, secondViewportPreset, systemWindowPreset];

  expect(
    createViewportPreset({ height: 844, name: 'Phone', target: 'window', width: 390 }, presets)
  ).toMatchObject({ id: 'created-preset', name: 'Phone', order: 2 });
});

it('moves a preset before another item without restoring the stale stored order', () => {
  const moved = moveViewportPresetBefore(
    [viewportPreset, secondViewportPreset, systemWindowPreset],
    secondViewportPreset.id,
    viewportPreset.id
  );

  expect(moved.map((preset) => preset.id)).toEqual([
    secondViewportPreset.id,
    viewportPreset.id,
    systemWindowPreset.id,
  ]);
  expect(moved.map((preset) => preset.order)).toEqual([0, 1, 2]);
});

it('accepts an 80-character name and rejects 81 characters at the mutation boundary', () => {
  expect(
    createViewportPreset({ height: 720, name: 'a'.repeat(80), target: 'window', width: 1280 }, [])
  ).toMatchObject({ name: 'a'.repeat(80) });
  expect(() =>
    createViewportPreset({ height: 720, name: 'a'.repeat(81), target: 'window', width: 1280 }, [])
  ).toThrow('name is invalid');
});

it('builds delete copy for selected and absent presets', () => {
  expect(getDeleteMessage(viewportPreset)).toContain('Viewport');
  expect(getDeleteMessage()).toContain('""');
});
