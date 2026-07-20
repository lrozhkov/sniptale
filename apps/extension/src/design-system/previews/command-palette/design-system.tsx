import { Camera, Image, Settings2 } from 'lucide-react';
import type { AppLocale } from '../../../platform/i18n';
import { createTranslator } from '../../../platform/i18n';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import { CommandPalette } from '../../../ui/command-palette/index';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';

function buildPreviewActions(locale: AppLocale): CommandPaletteAction[] {
  const translate = createTranslator(locale);

  return [
    {
      id: 'prepare-page',
      title: translate('popup.home.screenshotPrepLabel'),
      subtitle: translate('popup.home.screenshotPrepTitle'),
      section: translate('shared.ui.commandPaletteResultsSection'),
      shortcut: 'Alt+S',
      icon: <Camera size={16} strokeWidth={1.8} />,
      onSelect: () => undefined,
    },
    {
      id: 'open-editor',
      title: translate('popup.home.imageEditorLabel'),
      subtitle: translate('popup.home.imageEditorTitle'),
      section: translate('shared.ui.commandPaletteAllSection'),
      shortcut: 'Alt+E',
      icon: <Image size={16} strokeWidth={1.8} />,
      onSelect: () => undefined,
    },
    {
      id: 'open-settings',
      title: translate('popup.common.footerSettings'),
      subtitle: translate('settings.navigation.appearance'),
      section: translate('shared.ui.commandPaletteAllSection'),
      shortcut: 'Ctrl+,',
      icon: <Settings2 size={16} strokeWidth={1.8} />,
      onSelect: () => undefined,
    },
  ];
}

export function buildCommandPaletteSharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  return [
    designSystemPreview(
      'shared.ui.command-palette',
      'default',
      <DesignSystemFloatingPreviewFrame minHeight={420}>
        <CommandPalette
          isOpen
          onClose={() => undefined}
          actions={buildPreviewActions(locale)}
          dataUi="shared.ui.command-palette.preview"
        />
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'shared.ui.command-palette',
      'empty',
      <DesignSystemFloatingPreviewFrame minHeight={320}>
        <CommandPalette
          isOpen
          onClose={() => undefined}
          actions={[]}
          dataUi="shared.ui.command-palette.preview.empty"
        />
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}
