import type { AppLocale } from '../../../platform/i18n';
import type { AppTheme } from '../../../ui/theme';
import { CommandPalette } from '../../../ui/command-palette';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';
import { buildDesignSystemCommandPaletteActions } from './actions';
import type { DesignSystemPageState } from '../page/state/types';

interface DesignSystemCommandPaletteProps {
  locale: AppLocale;
  previewTheme: AppTheme;
  setPreviewTheme: (theme: AppTheme) => void;
  state: DesignSystemPageState;
  isOpen: boolean;
  onClose: () => void;
}

export function DesignSystemCommandPalette({
  locale,
  previewTheme,
  setPreviewTheme,
  state,
  isOpen,
  onClose,
}: DesignSystemCommandPaletteProps) {
  const actions: CommandPaletteAction[] = buildDesignSystemCommandPaletteActions({
    locale,
    previewTheme,
    setPreviewTheme,
    state,
  });

  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
      actions={actions}
      storageKey="sniptale.design-system.command-palette"
      dataUi="design-system.command-palette"
    />
  );
}
