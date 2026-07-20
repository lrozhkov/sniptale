import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { formatHotkeyShort, getQuickActionColor, getQuickActionMeta } from './meta';
import type { QuickAction, ViewportPreset } from '../../../../contracts/settings';

function createQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id: 'action-1',
    name: 'Action',
    icon: 'Camera',
    status: true,
    screenshotMode: 'visible',
    exitAfterCapture: false,
    ...overrides,
  };
}

function verifiesHotkeyFormatting() {
  expect(formatHotkeyShort(null)).toBe('');
  expect(
    formatHotkeyShort({
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: true,
      key: 'x',
    })
  ).toBe('Shift+X');
  expect(
    formatHotkeyShort({
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      key: 'ы',
    })
  ).toBe('Ctrl+S');
}

function verifiesQuickActionMeta() {
  const presets: ViewportPreset[] = [{ id: 'preset-1', label: 'Preset', width: 1280, height: 720 }];
  const quickActionWithUnknownAfterCapture = createQuickAction({
    screenshotMode: 'visible',
    emulation: 'native',
    delay: 5,
  });
  Object.assign(quickActionWithUnknownAfterCapture, { afterCapture: 'unknown-action' });

  expect(
    getQuickActionMeta(
      createQuickAction({
        screenshotMode: 'selection',
        emulation: 'preset-1',
        delay: 0,
        afterCapture: 'copy',
      }),
      presets
    )
  ).toContain('t:settings.quickActions.delayNone');

  expect(getQuickActionMeta(quickActionWithUnknownAfterCapture, presets)).toContain(
    'unknown-action'
  );
}

function verifiesQuickActionColorFallback() {
  expect(getQuickActionColor(createQuickAction())).toBeTruthy();
  expect(
    getQuickActionColor(
      createQuickAction({
        screenshotMode: 'unknown-mode' as QuickAction['screenshotMode'],
      })
    )
  ).toBe(getQuickActionColor(createQuickAction({ screenshotMode: 'visible' })));
}

function runPopupQuickActionUtilsSuite() {
  it('formats hotkeys and empty hotkeys', verifiesHotkeyFormatting);
  it('builds quick-action meta for preset, delay, and fallback branches', verifiesQuickActionMeta);
  it(
    'falls back to the visible-mode color for unknown screenshot modes',
    verifiesQuickActionColorFallback
  );
}

describe('popup quick-action utils', runPopupQuickActionUtilsSuite);
