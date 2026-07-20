import { CommandPalette } from '../../../ui/command-palette';
import { type CommandPaletteAction } from '../../../ui/command-palette/types';
import { SETTINGS_NAV_ITEMS, type SettingsTab } from '../navigation';
import { translate } from '../../../platform/i18n';

interface SettingsCommandPaletteProps {
  isOpen: boolean;
  activeTab: SettingsTab;
  onClose: () => void;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsCommandPalette({
  isOpen,
  activeTab,
  onClose,
  onTabChange,
}: SettingsCommandPaletteProps) {
  const actions: CommandPaletteAction[] = SETTINGS_NAV_ITEMS.map((item) => ({
    id: `settings-${item.id}`,
    title: translate(item.label),
    subtitle:
      item.id === activeTab
        ? translate('shared.ui.commandPaletteCurrentContextHint')
        : translate('shared.ui.commandPaletteNavigationHint'),
    section: translate('shared.ui.commandPaletteNavigationSection'),
    icon: <item.icon size={16} strokeWidth={1.8} />,
    onSelect: () => onTabChange(item.id),
  }));

  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
      actions={actions}
      storageKey="sniptale.settings.command-palette"
      dataUi="settings.command-palette"
    />
  );
}
