import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { DynamicIcon, formatHotkeyShort, getQuickActionColor, getQuickActionMeta } from './meta';
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
  const presets: ViewportPreset[] = [
    {
      kind: 'user',
      id: 'preset-1',
      name: 'Preset',
      target: 'window',
      width: 1280,
      height: 720,
      enabled: true,
      order: 0,
    },
  ];
  const quickActionWithUnknownAfterCapture = createQuickAction({
    screenshotMode: 'visible',
    viewportPresetId: 'native',
    delay: 5,
  });
  Object.assign(quickActionWithUnknownAfterCapture, { afterCapture: 'unknown-action' });

  expect(
    getQuickActionMeta(
      createQuickAction({
        screenshotMode: 'selection',
        viewportPresetId: 'preset-1',
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

function verifiesDynamicIconVariants() {
  const configuredIcon = renderToStaticMarkup(
    createElement(DynamicIcon, { color: '#123456', name: 'Download' })
  );
  const fallbackIcon = renderToStaticMarkup(createElement(DynamicIcon, { name: 'Unknown' }));

  expect(configuredIcon).toContain('lucide-download');
  expect(configuredIcon).toContain('color:#123456');
  expect(fallbackIcon).toContain('lucide-camera');
  expect(fallbackIcon).not.toContain('style=');
}

function runPopupQuickActionUtilsSuite() {
  it('formats hotkeys and empty hotkeys', verifiesHotkeyFormatting);
  it('builds quick-action meta for preset, delay, and fallback branches', verifiesQuickActionMeta);
  it(
    'falls back to the visible-mode color for unknown screenshot modes',
    verifiesQuickActionColorFallback
  );
  it('renders configured and fallback quick-action icons', verifiesDynamicIconVariants);
}

describe('popup quick-action utils', runPopupQuickActionUtilsSuite);
