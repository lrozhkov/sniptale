import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import {
  createDefaultQuickAction,
  getDelayLabel,
  getEmulationLabel,
  getQuickActionCountLabel,
  reorderQuickActions,
} from './helpers';

function verifyEmulationAndDelayLabels() {
  expect(getEmulationLabel(undefined, 'native')).toBe(
    translate('settings.quickActions.emulationNone')
  );
  expect(getEmulationLabel(undefined, null)).toBe(translate('settings.quickActions.emulationNone'));
  expect(
    getEmulationLabel([{ id: 'preset-1', label: 'Desktop', width: 1440, height: 900 }], 'preset-1')
  ).toBe('Desktop (1440×900)');
  expect(getEmulationLabel(undefined, 'custom-id')).toBe('custom-id');

  expect(getDelayLabel(null)).toBe('');
  expect(getDelayLabel(undefined)).toBe('');
  expect(getDelayLabel(0)).toBe(translate('settings.quickActions.delayNone'));
  expect(getDelayLabel(5)).toBe(`5 ${translate('settings.quickActions.delayShortSuffix')}`);
}

function verifyQuickActionCountAndDefaultAction() {
  expect(getQuickActionCountLabel(1)).toBeTruthy();

  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'quick-action-id') });

  expect(createDefaultQuickAction()).toEqual(
    expect.objectContaining({
      id: 'quick-action-id',
      screenshotMode: 'visible',
      emulation: 'native',
      afterCapture: 'download_default',
    })
  );
}

function verifyQuickActionReorder() {
  const actions = [
    { id: 'one', name: 'One' },
    { id: 'two', name: 'Two' },
    { id: 'three', name: 'Three' },
  ] as never;

  expect(reorderQuickActions(actions, 'one', 'three')?.map((action) => action.id)).toEqual([
    'two',
    'three',
    'one',
  ]);
  expect(reorderQuickActions(actions, 'missing', 'three')).toBeNull();
  expect(reorderQuickActions(actions, 'one', 'missing')).toBeNull();
}

function runQuickActionsSectionHelpersSuite() {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    'builds emulation and delay labels for native, preset, and fallback values',
    verifyEmulationAndDelayLabels
  );
  it(
    'builds quick-action count copy and a default quick-action payload',
    verifyQuickActionCountAndDefaultAction
  );
  it('reorders quick actions only when both ids exist', verifyQuickActionReorder);
}

describe('quick-actions section helpers', runQuickActionsSectionHelpersSuite);
