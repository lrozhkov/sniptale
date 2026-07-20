import { useEffect, useMemo, useState } from 'react';
import { translate, useAppLocale } from '../../../platform/i18n';
import { useCommandPaletteHotkey } from '../../../ui/command-palette/hotkey';
import { DesignSystemCommandPalette } from '../command-palette';
import { buildDesignSystemVariantPreviewMap } from '../../previews';
import { DesignSystemAppShell } from './app-shell';
import { useDesignSystemThemeSurface } from '../../theme';
import { useDesignSystemPageState } from './state';

export function DesignSystemPage() {
  const locale = useAppLocale();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const { previewTheme, setPreviewTheme } = useDesignSystemThemeSurface();
  const state = useDesignSystemPageState(locale);

  useEffect(() => {
    document.title = translate('designSystem.page.documentTitle');
  }, [locale]);

  useCommandPaletteHotkey({
    isOpen: commandPaletteOpen,
    onOpen: () => setCommandPaletteOpen(true),
    onClose: () => setCommandPaletteOpen(false),
  });

  const previewMap = useMemo(() => buildDesignSystemVariantPreviewMap(locale), [locale]);

  return (
    <div
      className={
        'sniptale-extension-surface min-h-screen bg-[var(--sniptale-color-surface-canvas)] ' +
        'text-[var(--sniptale-color-text-primary)]'
      }
    >
      <DesignSystemAppShell
        locale={locale}
        previewMap={previewMap}
        previewTheme={previewTheme}
        setPreviewTheme={setPreviewTheme}
        state={state}
      />
      <DesignSystemCommandPalette
        locale={locale}
        previewTheme={previewTheme}
        setPreviewTheme={setPreviewTheme}
        state={state}
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
