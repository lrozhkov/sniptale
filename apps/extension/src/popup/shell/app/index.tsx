import { useEffect, useRef, useState } from 'react';
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
import { finishPopupPerfSpanOnNextFrame, startPopupPerfSpan } from '../../diagnostics/performance';

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
function usePopupDeferredViewPreload(isReady: boolean) {
  useEffect(() => {
    initializePopupTracer();
    if (!isReady) return undefined;

    let idleId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => void preloadPopupDeferredViews());
      } else {
        idleId = window.setTimeout(() => void preloadPopupDeferredViews(), 0);
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (idleId === null) return;
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, [isReady]);
}

function PopupStartupShell() {
  return (
    <div className="popup-startup-shell" aria-hidden="true" data-ui="popup.app.startup-shell">
      <div className="popup-startup-shell__tabs" />
      <div className="popup-startup-shell__card">
        <span className="popup-startup-shell__line" style={{ width: 96, height: 14 }} />
        <span className="popup-startup-shell__line" style={{ width: '100%', height: 48 }} />
        <span className="popup-startup-shell__line" style={{ width: '84%', height: 12 }} />
        <span className="popup-startup-shell__line" style={{ width: '68%', height: 12 }} />
      </div>
      <div className="popup-startup-shell__footer" />
    </div>
  );
}

export function PopupApp() {
  usePageLocaleMetadata('popup.common.documentTitle');
  const runtime = usePopupRuntime();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const correctRouteSpanRef = useRef<ReturnType<typeof startPopupPerfSpan> | undefined>(undefined);
  if (correctRouteSpanRef.current === undefined) {
    correctRouteSpanRef.current = startPopupPerfSpan('popup.startup.correct-route-frame');
  }
  usePopupDeferredViewPreload(runtime.navigation.isReady);
  useEffect(() => {
    if (!runtime.navigation.isReady || !correctRouteSpanRef.current) return;
    finishPopupPerfSpanOnNextFrame(correctRouteSpanRef.current, {
      target: runtime.navigation.page,
    });
    correctRouteSpanRef.current = null;
  }, [runtime.navigation.isReady, runtime.navigation.page]);
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
      {runtime.navigation.isReady ? (
        <PopupAppShell
          runtime={runtime}
          commandPaletteOpen={commandPaletteOpen}
          onCloseCommandPalette={() => setCommandPaletteOpen(false)}
        />
      ) : (
        <PopupStartupShell />
      )}
    </div>
  );
}
