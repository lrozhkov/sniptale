import type { AppLocale, TranslationKey } from '../../../../../platform/i18n';
import { translate } from '../../../../../platform/i18n';
import {
  CONTEXT_MENU_STATIC_COMMANDS,
  type ContextMenuCommandNode,
} from '../../../../../contracts/settings/context-menu-layout';
import type { QuickAction, ViewportPreset } from '../../../../../contracts/settings';
import { getBundledQuickActionConfig } from '../../../../../features/quick-actions-presets/catalog';
import { getViewportPresetDisplayName } from '../../../../../features/viewport-presets/display-name';

export interface ContextMenuCatalogItem {
  command: string;
  label: string;
  group: string;
  available: boolean;
}

const staticCommands: Record<string, { group: TranslationKey; label: TranslationKey }> = {
  'sniptale.screenshots.prepare': {
    group: 'settings.appearance.contextMenuGroupScreenshots',
    label: 'popup.home.screenshotPrepLabel',
  },
  'sniptale.video.tab': {
    group: 'settings.appearance.contextMenuGroupVideo',
    label: 'popup.video.modeTabLabel',
  },
  'sniptale.video.area': {
    group: 'settings.appearance.contextMenuGroupVideo',
    label: 'popup.video.modeAreaLabel',
  },
  'sniptale.video.preset': {
    group: 'settings.appearance.contextMenuGroupVideo',
    label: 'popup.video.modePresetLabel',
  },
  'sniptale.video.window': {
    group: 'settings.appearance.contextMenuGroupVideo',
    label: 'popup.video.modeScreenLabel',
  },
  'sniptale.export.start': {
    group: 'settings.appearance.contextMenuGroupExport',
    label: 'popup.export.exportButton',
  },
  'sniptale.export.copy-json': {
    group: 'settings.appearance.contextMenuGroupExport',
    label: 'popup.export.copyJsonButton',
  },
  'sniptale.export.copy-markdown': {
    group: 'settings.appearance.contextMenuGroupExport',
    label: 'popup.export.copyMarkdownButton',
  },
  'sniptale.image-editor': {
    group: 'settings.appearance.contextMenuGroupOpen',
    label: 'popup.home.imageEditorLabel',
  },
  'sniptale.video-editor': {
    group: 'settings.appearance.contextMenuGroupOpen',
    label: 'popup.video.videoEditorLabel',
  },
  'sniptale.gallery': {
    group: 'settings.appearance.contextMenuGroupOpen',
    label: 'popup.home.galleryLabel',
  },
  'sniptale.page-link.rich': {
    group: 'settings.appearance.contextMenuGroupCopy',
    label: 'popup.common.pageLinkCopyRichLabel',
  },
  'sniptale.page-link.markdown': {
    group: 'settings.appearance.contextMenuGroupCopy',
    label: 'popup.common.pageLinkCopyMarkdownLabel',
  },
  'sniptale.page-link.plain': {
    group: 'settings.appearance.contextMenuGroupCopy',
    label: 'popup.common.pageLinkCopyPlainLabel',
  },
  'sniptale.settings': {
    group: 'settings.appearance.contextMenuGroupOpen',
    label: 'popup.common.footerSettings',
  },
};

export function buildContextMenuCatalog(
  actions: readonly QuickAction[],
  presets: readonly ViewportPreset[],
  locale: AppLocale
): ContextMenuCatalogItem[] {
  const staticItems = CONTEXT_MENU_STATIC_COMMANDS.map((command) => {
    const meta = staticCommands[command]!;
    return {
      command,
      label: translate(meta.label, locale),
      group: translate(meta.group, locale),
      available: true,
    };
  });
  const quickActions = actions.map((action) => {
    const bundled = getBundledQuickActionConfig(action);
    return {
      command: `sniptale.screenshots.quick-action.${action.id}`,
      label:
        bundled && action.customized !== true ? translate(bundled.nameKey, locale) : action.name,
      group: translate('settings.appearance.contextMenuGroupScreenshots', locale),
      available: action.status,
    };
  });
  const windowPresets = presets
    .filter((preset) => preset.target === 'window')
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((preset) => ({
      command: `sniptale.window-resize.preset.${encodeURIComponent(preset.id)}`,
      label: `${getViewportPresetDisplayName(preset, locale)} · ${preset.width} × ${preset.height}`,
      group: translate('settings.appearance.contextMenuGroupWindow', locale),
      available: preset.enabled,
    }));
  return [...staticItems, ...quickActions, ...windowPresets];
}

export function contextMenuCommandLabel(
  node: ContextMenuCommandNode,
  catalog: readonly ContextMenuCatalogItem[],
  locale: AppLocale
): string {
  return (
    node.title ??
    catalog.find((item) => item.command === node.command)?.label ??
    `${translate('settings.appearance.contextMenuMissingCommand', locale)} · ${node.command}`
  );
}
