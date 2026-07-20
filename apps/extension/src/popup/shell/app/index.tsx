import { useEffect, useState } from 'react';
import { usePageLocaleMetadata } from '../../../platform/i18n';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { usePopupRuntime } from '../runtime';
import { usePopupCommandPaletteHotkey } from '../command-palette/hotkey';
import { preloadPopupDeferredViews } from '../lazy-chunks';
import { initializePopupTracer } from '../../diagnostics/tracing';
import { PopupAppShell } from '../app-shell';

const POPUP_ROOT_CLASS_NAME =
  'sc-popup-shell sniptale-extension-surface relative h-[560px] w-[392px] overflow-hidden';
const POPUP_ROOT_SURFACE_CLASS_NAME =
  'bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-primary)]';
const POPUP_BACKGROUND_ORBS_CLASS_NAME = 'pointer-events-none absolute inset-0';
const POPUP_BACKGROUND_ORBS_SURFACE_CLASS_NAME = [
  'bg-[radial-gradient(circle_at_top,',
  'color-mix(in_srgb,var(--sniptale-color-accent-soft)_82%,transparent),transparent_36%),',
  'radial-gradient(circle_at_bottom,',
  'color-mix(in_srgb,var(--sniptale-color-info)_18%,transparent),transparent_38%),',
  'radial-gradient(circle_at_75%_20%,',
  'color-mix(in_srgb,var(--sniptale-color-danger)_14%,transparent),transparent_30%)]',
].join('');
function usePopupDeferredViewPreload() {
  useEffect(() => {
    initializePopupTracer();

    const preloadTimeoutId = window.setTimeout(() => {
      void preloadPopupDeferredViews();
    }, 150);

    return () => {
      window.clearTimeout(preloadTimeoutId);
    };
  }, []);
}

export function PopupApp() {
  usePageLocaleMetadata('popup.common.documentTitle');
  const runtime = usePopupRuntime();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  usePopupDeferredViewPreload();
  usePopupCommandPaletteHotkey({
    isOpen: commandPaletteOpen,
    onOpen: () => setCommandPaletteOpen(true),
    onClose: () => setCommandPaletteOpen(false),
  });
  return (
    <div
      data-ui="popup.app.root"
      className={[POPUP_ROOT_CLASS_NAME, POPUP_ROOT_SURFACE_CLASS_NAME].join(' ')}
    >
      <div
        className={[
          POPUP_BACKGROUND_ORBS_CLASS_NAME,
          POPUP_BACKGROUND_ORBS_SURFACE_CLASS_NAME,
        ].join(' ')}
      />
      <PopupAppShell
        runtime={runtime}
        commandPaletteOpen={commandPaletteOpen}
        onCloseCommandPalette={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
