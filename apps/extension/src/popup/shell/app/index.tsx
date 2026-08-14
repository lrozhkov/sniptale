import { useEffect, useState, type ComponentType } from 'react';
import { popupTabsMessages } from '../../../platform/i18n/messages/popup/tabs';
import { commonMessages } from '../../../platform/i18n/messages/common';
import type { AppLocale } from '../../../platform/i18n/types';
import type { PopupPage } from '../navigation/actions';
import { usePopupRouteController } from '../startup/use-route-controller';
import { usePopupStartupReconciliation } from './use-startup-reconciliation';

const pages: PopupPage[] = ['home', 'video', 'export'];

function readInitialLocale(): AppLocale {
  return document.documentElement.dataset['locale'] === 'en' ? 'en' : 'ru';
}

export function PopupApp() {
  const route = usePopupRouteController();
  const Route = route.Route;
  const [locale, setLocale] = useState<AppLocale>(readInitialLocale);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [Palette, setPalette] = useState<ComponentType<{
    page: PopupPage | null;
    onClose: () => void;
    onNavigate: (page: PopupPage) => void;
  }> | null>(null);
  usePopupStartupReconciliation(setLocale);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        if (!Palette) {
          void import('../command-palette/route-first').then((module) =>
            setPalette(() => module.RouteFirstPopupCommandPalette)
          );
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [Palette]);

  return (
    <div className="popup-react-shell" data-ui="popup.app.root">
      <nav className="popup-react-shell__tabs" data-ui="popup.app.tabs">
        {pages.map((candidate) => (
          <button
            key={candidate}
            type="button"
            data-active={route.page === candidate ? 'true' : 'false'}
            aria-busy={route.pendingPage === candidate || undefined}
            onFocus={() => preload(candidate)}
            onPointerEnter={() => preload(candidate)}
            onPointerDown={() => preload(candidate)}
            onClick={() => void route.navigate(candidate)}
          >
            {popupTabsMessages[candidate][locale]}
          </button>
        ))}
      </nav>
      {route.routeLoadError ? (
        <section
          className="popup-react-shell__route-error"
          data-ui="popup.app.route-error"
          role="alert"
        >
          <span>{commonMessages.bootstrap.errorTitle[locale]}</span>
          <button type="button" onClick={route.retryRouteLoad}>
            {commonMessages.actions.retry[locale]}
          </button>
        </section>
      ) : null}
      <main className="popup-react-shell__content" data-ui="popup.app.content">
        {Route && route.startup ? <Route startup={route.startup} /> : null}
      </main>
      {paletteOpen && Palette ? (
        <Palette
          page={route.page}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(target) => void route.navigate(target)}
        />
      ) : null}
    </div>
  );
}

function preload(page: PopupPage): void {
  void import('../startup/resource').then(({ preloadPopupPage }) =>
    preloadPopupPage(page).catch(() => undefined)
  );
}
