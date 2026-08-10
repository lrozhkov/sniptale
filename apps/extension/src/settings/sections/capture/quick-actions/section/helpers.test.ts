import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { formatViewportPresetDimensions } from '../../../../../features/viewport-presets/format';
import {
  createDefaultQuickAction,
  getDelayLabel,
  getViewportPresetLabel,
  reorderQuickActionsBefore,
} from './helpers';

function verifyEmulationAndDelayLabels() {
  expect(getViewportPresetLabel(undefined, null)).toBe(
    translate('settings.quickActions.emulationNone')
  );
  expect(
    getViewportPresetLabel(
      [
        {
          kind: 'user',
          id: 'preset-1',
          name: 'Desktop',
          target: 'viewport',
          width: 1440,
          height: 900,
          enabled: true,
          order: 0,
        },
      ],
      'preset-1'
    )
  ).toBe(`Desktop (${formatViewportPresetDimensions(1440, 900)})`);
  expect(getViewportPresetLabel(undefined, 'custom-id')).toBe('custom-id');

  expect(getDelayLabel(null)).toBe('');
  expect(getDelayLabel(undefined)).toBe('');
  expect(getDelayLabel(0)).toBe(translate('settings.quickActions.delayNone'));
  expect(getDelayLabel(5)).toBe(`5 ${translate('settings.quickActions.delayShortSuffix')}`);
}

function verifyDefaultAction() {
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'quick-action-id') });

  expect(createDefaultQuickAction()).toEqual(
    expect.objectContaining({
      id: 'quick-action-id',
      screenshotMode: 'visible',
      viewportPresetId: null,
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

  expect(reorderQuickActionsBefore(actions, 'one', null)?.map((action) => action.id)).toEqual([
    'two',
    'three',
    'one',
  ]);
  expect(reorderQuickActionsBefore(actions, 'missing', 'three')).toBeNull();
  expect(reorderQuickActionsBefore(actions, 'one', 'missing')).toBeNull();
}

function runQuickActionsSectionHelpersSuite() {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    'builds emulation and delay labels for native, preset, and fallback values',
    verifyEmulationAndDelayLabels
  );
  it('builds quick-action count copy and a default quick-action payload', verifyDefaultAction);
  it('reorders quick actions only when the moved and anchor ids exist', verifyQuickActionReorder);
}

describe('quick-actions section helpers', runQuickActionsSectionHelpersSuite);
