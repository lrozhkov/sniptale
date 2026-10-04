import { describe, expect, it } from 'vitest';
import type { QuickAction, ViewportPreset } from '../../../../../contracts/settings';
import { CONTEXT_MENU_STATIC_COMMANDS } from '../../../../../contracts/settings/context-menu-layout';
import { translate } from '../../../../../platform/i18n';
import { buildContextMenuCatalog, contextMenuCommandLabel } from './context-menu-catalog';

function action(id: string, overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id,
    name: id,
    status: true,
    icon: 'Camera',
    screenshotMode: 'visible',
    exitAfterCapture: true,
    ...overrides,
  };
}
function preset(id: string, order: number, enabled = true): ViewportPreset {
  return { id, name: id, kind: 'user', target: 'window', width: 1280, height: 720, order, enabled };
}

describe('context menu catalog', () => {
  it('includes every static dispatch command in both locales with translated groups and labels', () => {
    for (const locale of ['en', 'ru'] as const) {
      const catalog = buildContextMenuCatalog([], [], locale);
      expect(catalog.map((item) => item.command)).toEqual(CONTEXT_MENU_STATIC_COMMANDS);
      expect(
        catalog.every((item) => item.available && item.group.length > 0 && item.label.length > 0)
      ).toBe(true);
      expect(catalog.find((item) => item.command === 'sniptale.settings')?.label).toBe(
        translate('popup.common.footerSettings', locale)
      );
      expect(catalog.find((item) => item.command === 'sniptale.video.tab')?.group).toBe(
        translate('settings.appearance.contextMenuGroupVideo', locale)
      );
    }
    expect(
      buildContextMenuCatalog([], [], 'en').find((item) => item.command === 'sniptale.settings')
        ?.label
    ).not.toBe(
      buildContextMenuCatalog([], [], 'ru').find((item) => item.command === 'sniptale.settings')
        ?.label
    );
  });

  it('localizes bundled actions unless customized and keeps unavailable actions visible', () => {
    const actions = [
      action('default-visible-download', {
        origin: 'bundled',
        name: 'Stored English',
        customized: false,
      }),
      action('default-visible-copy', { origin: 'bundled', name: 'Custom copy', customized: true }),
      action('my-action', { name: 'My action', status: false }),
    ];
    const catalog = buildContextMenuCatalog(actions, [], 'ru');
    expect(catalog.find((item) => item.command.endsWith('default-visible-download'))?.label).toBe(
      translate('shared.defaults.quickActionVisibleDownload', 'ru')
    );
    expect(catalog.find((item) => item.command.endsWith('default-visible-copy'))?.label).toBe(
      'Custom copy'
    );
    expect(catalog.find((item) => item.command.endsWith('my-action'))).toMatchObject({
      label: 'My action',
      available: false,
    });
  });

  it('sorts window presets, keeps disabled ones in catalog, and uses localized system names', () => {
    const presets: ViewportPreset[] = [
      preset('later', 5, false),
      {
        id: 'system-hd',
        kind: 'system',
        systemKey: 'windowHd',
        catalogRevision: 3,
        customized: false,
        target: 'window',
        width: 1280,
        height: 720,
        order: 0,
        enabled: true,
      },
      preset('earlier', 0),
    ];
    const catalog = buildContextMenuCatalog([], presets, 'ru').filter((item) =>
      item.command.startsWith('sniptale.window-resize.preset.')
    );
    expect(catalog.map((item) => item.command)).toEqual([
      'sniptale.window-resize.preset.earlier',
      'sniptale.window-resize.preset.system-hd',
      'sniptale.window-resize.preset.later',
    ]);
    expect(catalog[1]?.label).toContain(translate('viewportPresets.systemNames.windowHd', 'ru'));
    expect(catalog[2]).toMatchObject({ available: false, label: 'later · 1280 × 720' });
  });

  it('prefers edited titles, then catalog labels, and explains missing references', () => {
    const catalog = buildContextMenuCatalog([], [], 'en');
    const command = 'sniptale.gallery';
    expect(
      contextMenuCommandLabel(
        { type: 'command', command, enabled: true, title: 'My Library' },
        catalog,
        'en'
      )
    ).toBe('My Library');
    expect(
      contextMenuCommandLabel({ type: 'command', command, enabled: true }, catalog, 'en')
    ).toBe(catalog.find((item) => item.command === command)?.label);
    expect(
      contextMenuCommandLabel(
        { type: 'command', command: 'sniptale.screenshots.quick-action.gone', enabled: true },
        catalog,
        'en'
      )
    ).toContain(translate('settings.appearance.contextMenuMissingCommand', 'en'));
  });
});
