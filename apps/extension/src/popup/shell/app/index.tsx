import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { popupTabsMessages } from '../../../platform/i18n/messages/popup/tabs';
import { commonMessages } from '../../../platform/i18n/messages/common';
import type { AppLocale } from '../../../platform/i18n/types';
import type { PopupPage } from '../navigation/actions';
import { usePopupRouteController } from '../startup/use-route-controller';
import { usePopupStartupReconciliation } from './use-startup-reconciliation';

const pages: Array<{ page: PopupPage; icon: ReactNode }> = [
  {
    page: 'screenshots',
    icon: (
      <ShellIcon path="M4 7h3l1.5-2h7L17 7h3v11H4V7Zm8 3.25a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z" />
    ),
  },
  { page: 'video', icon: <ShellIcon path="M4 6.5h11v11H4v-11Zm11 3.5 5-2.5v9L15 14v-4Z" /> },
  { page: 'menu', icon: <ShellIcon path="M5 7h14M5 12h14M5 17h14" strokeOnly /> },
  {
    page: 'tools',
    icon: (
      <ShellIcon path="m14.7 6.3 3-3a5 5 0 0 1-6.4 6.4L5 16l3 3 6.3-6.3a5 5 0 0 1 6.4-6.4l-3 3-3-3Z" />
    ),
  },
  { page: 'export', icon: <ShellIcon path="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" strokeOnly /> },
];

function ShellIcon({ path, strokeOnly = false }: { path: string; strokeOnly?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={path}
        fill={strokeOnly ? 'none' : 'currentColor'}
        stroke={strokeOnly ? 'currentColor' : 'none'}
        strokeWidth={strokeOnly ? 1.8 : undefined}
        strokeLinecap={strokeOnly ? 'round' : undefined}
        strokeLinejoin={strokeOnly ? 'round' : undefined}
      />
    </svg>
  );
}

function readInitialLocale(): AppLocale {
  return document.documentElement.dataset['locale'] === 'en' ? 'en' : 'ru';
}

export function PopupApp() {
  const route = usePopupRouteController();
  const Route = route.Route;
  const [locale, setLocale] = useState<AppLocale>(readInitialLocale);
  const palette = useRouteFirstPalette();
  usePopupStartupReconciliation(setLocale);

  return (
    <div className="popup-react-shell sniptale-extension-surface" data-ui="popup.app.root">
      <PopupNavigation locale={locale} route={route} />
      <PopupRouteError
        locale={locale}
        error={route.routeLoadError}
        onRetry={route.retryRouteLoad}
      />
      <main
        className="popup-react-shell__content"
        data-ui="popup.app.content"
        aria-busy={!Route || undefined}
      >
        {Route && route.startup ? (
          <div
            key={route.page}
            className="popup-react-shell__route-frame"
            data-animate={route.hasCommittedNavigation ? 'true' : 'false'}
          >
            <Route
              startup={route.startup}
              navigateToDescriptor={(descriptor) => void route.navigateToDescriptor(descriptor)}
            />
          </div>
        ) : (
          <PopupRouteSkeleton />
        )}
      </main>
      {palette.open && palette.Component ? (
        <palette.Component
          page={route.page}
          onClose={() => palette.setOpen(false)}
          onNavigate={(target) => void route.navigate(target)}
        />
      ) : null}
    </div>
  );
}

type PaletteComponent = ComponentType<{
  page: PopupPage | null;
  onClose: () => void;
  onNavigate: (page: PopupPage) => void;
}>;

function useRouteFirstPalette() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [Palette, setPalette] = useState<PaletteComponent | null>(null);

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
  return { Component: Palette, open: paletteOpen, setOpen: setPaletteOpen };
}

function PopupNavigation({
  locale,
  route,
}: {
  locale: AppLocale;
  route: ReturnType<typeof usePopupRouteController>;
}) {
  return (
    <nav
      className="popup-react-shell__tabs"
      data-animate={route.hasCommittedNavigation ? 'true' : 'false'}
      data-ui="popup.app.tabs"
    >
      <span
        aria-hidden="true"
        className="popup-react-shell__tab-indicator"
        data-page={route.page ?? 'none'}
      />
      {pages.map(({ page: candidate, icon }) => (
        <button
          key={candidate}
          type="button"
          data-page={candidate}
          data-active={route.page === candidate ? 'true' : 'false'}
          aria-busy={route.pendingPage === candidate || undefined}
          onFocus={() => preload(candidate)}
          onPointerEnter={() => preload(candidate)}
          onPointerDown={() => preload(candidate)}
          onClick={() => void route.navigate(candidate)}
          title={popupTabsMessages[candidate][locale]}
          aria-label={popupTabsMessages[candidate][locale]}
        >
          {icon}
        </button>
      ))}
    </nav>
  );
}

function PopupRouteError({
  locale,
  error,
  onRetry,
}: {
  locale: AppLocale;
  error: unknown;
  onRetry(): void;
}) {
  if (!error) return null;
  return (
    <section
      className="popup-react-shell__route-error"
      data-ui="popup.app.route-error"
      role="alert"
    >
      <span>{commonMessages.bootstrap.errorTitle[locale]}</span>
      <button type="button" onClick={onRetry}>
        {commonMessages.actions.retry[locale]}
      </button>
    </section>
  );
}

function PopupRouteSkeleton() {
  return (
    <div
      className="popup-react-shell__skeleton"
      data-ui="popup.app.route-skeleton"
      aria-hidden="true"
    >
      <div className="popup-react-shell__skeleton-heading" />
      <div className="popup-react-shell__skeleton-row" />
      <div className="popup-react-shell__skeleton-grid">
        <div />
        <div />
        <div />
        <div />
      </div>
      <div className="popup-react-shell__skeleton-action" />
    </div>
  );
}

function preload(page: PopupPage): void {
  void import('../startup/resource').then(({ preloadPopupPage }) =>
    preloadPopupPage(page).catch(() => undefined)
  );
}
